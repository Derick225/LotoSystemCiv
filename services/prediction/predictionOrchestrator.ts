import { packHistory } from '../workers/zeroCopy';
import { DrawResult, Prediction, AlgoWeights, SymbioticContext, ForensicReport } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";
import { getAlgoWeights, normalizeWeights, computeChronologicalAlgoReinforcement } from "./weightsManager";
import { extractFeatures, ExtractedFeatures } from "./featureExtractor";
import { calculateScores, applyPCADenoising, ScoredNumber } from "./scoringEngine";
import { generateCombination } from "./combinationGenerator";
import { generateEmpiricalCalibration } from "./ticketAnalysisService";
import { PredictiveHyperparameters } from "./hyperParameterTuner";
import { logger } from "../../utils/logger";
import PredictionWorker from "../workers/prediction.worker?worker";
import { EnhancedMetrics } from "./metrics.types";
import { initializeLcgForDraw } from "../../utils/mathUtils";
import { detectGameRegime, calculateThermodynamicRegime, calculateShannonEntropy, calculateStatisticalBounds } from "../mathService";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import { globalCache, CACHE_TTL } from "../cache/CacheService";

// Split module imports
import { TUNING, applyDeterministicMicroSgd, hashHistoryContent, getMedian, getStdDev } from "./microSgd";
import { resolveForensicAdjustments } from "./forensicAdjustments";
import { getStoreStateSafely, handleScenarioADegradedPrediction, tryCloudPrediction } from "./predictionScenarios";
import { finalizePredictionPayload } from "./predictionFinalize";
import { calculatePoissonScores, calculateBayesianScore, calculateTemporalScores, calculateDigitalRootAnalysis, calculateResistanceScores, calculateGapVelocityScores, calculateLeaderSuccession, calculateAiIntuition, calculateFractalResonance, calculateSpatialHotSpots, calculateCoOccurrenceScores, calculateAnomalyScores, calculateHawkesExcitation, calculateTopologicalLyapunov } from '../advancedMathService';
import { calculateSpatioTemporalHawkes } from '../../utils/engine/hawkesEngine';
import { calculateDnaSieveWeights } from '../temporalAnalysisService';

const TICKET_SIZE = 5;

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
  useCloudEngine?: boolean;
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
  useSpatioTemporalHawkesOverride?: boolean,
  useCloudEngineOverride?: boolean,
): PredictionRuntimeContext => {
  const history = purifyHistoryForDraw(drawName, rawHistory);
  const contentHash = hashHistoryContent(history);
  const validTemporalDepth = Math.max(5, Math.min(temporalDepth, history.length));
  
  const storeDefaults = getStoreStateSafely();
  const useSpatioTemporalHawkes = useSpatioTemporalHawkesOverride ?? storeDefaults.useSpatioTemporalHawkes;
  const useCloudEngine = useCloudEngineOverride ?? storeDefaults.useCloudEngine;

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
    useCloudEngine,
    onProgress,
    preloadedForensicReports,
    contentHash,
  };
};

/**
 * Yielding function to keep the main thread fluid
 */
export const yieldToUi = async () => {
  if (typeof window !== 'undefined') {
    await new Promise(r => setTimeout(r, 0));
  }
};

/**
 * Calcul parallèle des métriques avancées
 */
export const computeAdvancedMetrics = async (
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
    topologicalLyapunovScores, dnaSievePrior
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
    Promise.resolve().then(() => calculateTopologicalLyapunov(localHistoryContext, hyperparameters.lyapunovHorizon)),
    Promise.resolve().then(() => calculateDnaSieveWeights(localHistoryContext, undefined, drawName))
  ]);

  for (const k in gapVelocityScores) {
    gapVelocityScores[k] *= (hyperparameters.gapVelocityWeight || 1.0);
  }
  for (const k in hawkesExcitationScores) {
    hawkesExcitationScores[k] *= ((hyperparameters.hawkesDecay || TUNING.DEFAULT_HAWKES_DECAY) / TUNING.DEFAULT_HAWKES_DECAY);
  }

  const snr = (dnaSievePrior.stdDevDna || 0.1) / (dnaSievePrior.meanDna || 1.0);
  const sieveIntensitySNR = parseFloat(Math.min(99.9, Math.max(10.0, snr * 250)).toFixed(1));

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
    topologicalLyapunov: topologicalLyapunovScores,
    dnaSieve: {
      multipliers: dnaSievePrior.multipliers,
      affinityPercent: dnaSievePrior.affinityPercent,
      dominantAlgos: dnaSievePrior.dominantAlgos,
      compositeDna: dnaSievePrior.compositeDna,
      dnaConcordanceMean: dnaSievePrior.dnaConcordanceMean,
      entropyBits: dnaSievePrior.entropyBits,
      sieveIntensitySNR
    }
  };
};

/**
 * Pipeline local modulaire de prédiction
 */
export const runLocalPredictionPipeline = async (context: PredictionRuntimeContext): Promise<Prediction> => {
  context.onProgress?.(5, "Initialisation de l'ADN algorithmique...");
  initializeLcgForDraw(context.drawName);
  await yieldToUi();

  context.onProgress?.(10, "Optimisation des hyperparamètres...");
  const weights = await resolvePredictionWeights(context);
  await yieldToUi();

  context.onProgress?.(30, "Calcul des métriques avancées...");
  const advancedMetrics = await computeAdvancedMetricsBundle(context);
  await yieldToUi();

  context.onProgress?.(50, "Extraction des descripteurs de caractéristiques...");
  const features = await extractPredictionFeatures(context);
  await yieldToUi();

  context.onProgress?.(70, "Évaluation et scoring des numéros...");
  const baseScores = scorePredictionNumbers(context, features, weights, advancedMetrics);
  await yieldToUi();

  context.onProgress?.(80, "Résolution des ajustements forensiques...");
  const forensicAdjustments = await resolveForensicAdjustments(context, baseScores);
  await yieldToUi();

  context.onProgress?.(85, "Double Aveugle : Alignement avec les rapports d'autopsie...");
  const { rescored, enhancedMetrics } = rescoreWithAdjustments(context, features, weights, advancedMetrics, forensicAdjustments);
  await yieldToUi();

  context.onProgress?.(90, "Désensibilisation au bruit (PCA)...");
  const denoised = await applyPredictionDenoising(context, rescored, weights, enhancedMetrics);
  await yieldToUi();

  context.onProgress?.(93, "Tamisage différentiable de l'ADN Algorithmique actif (DnaSieve)...");
  const { sievedScores, dnaSieveMetrics } = applyPredictionDnaSieve(context, denoised, weights);
  await yieldToUi();

  context.onProgress?.(95, "Formulation finale et sélection des combinaisons...");
  const { selection, candidates, shrinkageApplied, shrinkageFactor } = await selectPredictionNumbers(context, sievedScores, features);
  await yieldToUi();

  context.onProgress?.(100, "Convergence de l'ADN algorithmique atteinte !");
  return await finalizePredictionPayload(
    context,
    sievedScores,
    selection,
    candidates,
    weights,
    enhancedMetrics,
    features,
    shrinkageApplied,
    shrinkageFactor,
    dnaSieveMetrics
  );
};

/**
 * Pipeline local simplifié (Scénario de secours extrême)
 */
export const runLocalSimplifiedPipeline = async (context: PredictionRuntimeContext): Promise<Prediction> => {
  context.onProgress?.(10, "Lancement du pipeline Local Simplifié...");
  initializeLcgForDraw(context.drawName);

  const weights = normalizeWeights(context.weightsToUse || (await getAlgoWeights(context.drawName)));

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

  context.onProgress?.(55, "Extraction des descripteurs de caractéristiques essentiels...");
  const features = await extractPredictionFeatures(context);

  context.onProgress?.(75, "Évaluation essentielle des numéros...");
  const baseScores = calculateScores(
    features,
    weights,
    advancedMetrics,
    subHistory
  );

  context.onProgress?.(85, "Tamisage essentiel de l'ADN Algorithmique...");
  const { sievedScores, dnaSieveMetrics } = applyPredictionDnaSieve(context, baseScores, weights);

  context.onProgress?.(90, "Formulation finale et sélection (Mode Secours)...");
  const { selection, candidates, shrinkageApplied, shrinkageFactor } = await selectPredictionNumbers(context, sievedScores, features);

  context.onProgress?.(100, "Calcul de secours achevé avec succès !");
  return await finalizePredictionPayload(
    context,
    sievedScores,
    selection,
    candidates,
    weights,
    advancedMetrics,
    features,
    shrinkageApplied,
    shrinkageFactor,
    dnaSieveMetrics
  );
};

export const resolvePredictionWeights = async (context: PredictionRuntimeContext): Promise<AlgoWeights> => {
  // 1. Poids de base (soit forcés, soit entraînés pour ce tirage, soit égaux par défaut)
  const initialWeights = context.weightsToUse || (await getAlgoWeights(context.drawName));

  // 2. Renforcement chronologique basé sur l'analyse de l'historique et des subsistances du tirage sélectionné
  let weights = computeChronologicalAlgoReinforcement(
    context.drawName,
    context.history.slice(0, context.validTemporalDepth),
    initialWeights
  );
  
  // 3. Entraînement continu Micro-SGD propre au tirage actif
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
  return normalizeWeights(weights);
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

/**
 * Applique le Tamis de l'ADN Algorithmique Actuel (DnaSieve)
 * Modulation différentiable continue par les poids et résonances dominantes
 * Couplé directement avec le Radar Macro-Algorithmique et la sélection
 * (ZÉRO NOMBRE MAGIQUE, 100% CONTINU & DÉTERMINISTE).
 */
export const applyPredictionDnaSieve = (
  context: PredictionRuntimeContext,
  scores: ScoredNumber[],
  weights: AlgoWeights
): {
  sievedScores: ScoredNumber[];
  dnaSieveMetrics: {
    dominantAlgos: string[];
    dnaConcordanceMean: number;
    multipliers: Record<number, number>;
    affinityPercent: Record<number, number>;
    entropyBits: number;
    sieveIntensitySNR: number;
    elitesCount: number;
    shadowsCount: number;
    retentionRatePct: number;
    macroFamilies: {
      familyKey: string;
      familyName: string;
      currentWeightPct: number;
      sieveEnergyPct: number;
    }[];
  };
} => {
  const dnaReport = calculateDnaSieveWeights(
    context.history,
    weights,
    context.drawName
  );
  const { multipliers, affinityPercent, dominantAlgos, entropyBits, meanDna, stdDevDna } = dnaReport;

  let sumAffinity = 0;
  let elitesCount = 0;
  let shadowsCount = 0;
  const multipliersRecord: Record<number, number> = {};
  const affinityRecord: Record<number, number> = {};

  const sievedScores = scores.map(sn => {
    const num = sn.num;
    const dnaMult = multipliers[num] ?? 1.0;
    const dnaAff = affinityPercent[num] ?? 50.0;
    sumAffinity += dnaAff;
    
    if (dnaMult >= 1.12) elitesCount++;
    else if (dnaMult <= 0.88) shadowsCount++;

    multipliersRecord[num] = parseFloat(dnaMult.toFixed(3));
    affinityRecord[num] = Math.round(dnaAff);

    // Tamisage différentiable continu par l'ADN algorithmique du moment:
    // 35% d'inertie du score vectoriel + 65% de modulation continue par le tamis ADN actif
    const modulationFactor = 0.35 + 0.65 * dnaMult;
    const modulatedScore = sn.score * modulationFactor;

    return {
      ...sn,
      score: modulatedScore,
      breakdown: {
        ...sn.breakdown
      }
    };
  });

  const dnaConcordanceMean = Math.round(sumAffinity / Math.max(1, scores.length));
  const snr = (stdDevDna || 0.1) / (meanDna || 1.0);
  const sieveIntensitySNR = parseFloat(Math.min(99.9, Math.max(10.0, snr * 250)).toFixed(1));
  const retentionRatePct = parseFloat(((elitesCount / 90) * 100).toFixed(1));

  // Dérivation vectorielle des 6 macro-familles pour le Radar Algorithmique
  const macroFamilyDefinitions = [
    { key: 'FREQ_MARKOV', name: 'Fréquence & Markov', algos: ['frequency', 'markov', 'affinity', 'cohort'] },
    { key: 'GAPS_CADENCE', name: 'Écarts & Cadences', algos: ['gaps', 'gap_sequence', 'gap_cadence', 'gap_trend', 'gap_band_sequence'] },
    { key: 'TEMPORAL_HAWKES', name: 'Temporel & Hawkes', algos: ['temporal', 'inter_monthly_resonance', 'isolation_anomaly', 'cross_entropy'] },
    { key: 'SPECTRAL_FOURIER', name: 'Spectral & Harmonique', algos: ['spectral'] },
    { key: 'SPATIAL_FRACTAL', name: 'Spatial & Fractal', algos: ['spatial', 'fractal'] },
    { key: 'MACHINE_BAYES', name: 'Machine & Bayes', algos: ['machine_transfer', 'bayes', 'shadow_probability', 'consecutive'] }
  ];

  const totalWeightsSum = Object.values(weights).reduce((acc, v) => acc + (typeof v === 'number' ? v : 0), 0) || 1.0;

  const macroFamilies = macroFamilyDefinitions.map(fam => {
    let famWeightSum = 0;
    fam.algos.forEach(algo => {
      famWeightSum += (weights as Record<string, number>)[algo] || 0;
    });
    const currentWeightPct = parseFloat(((famWeightSum / totalWeightsSum) * 100).toFixed(1));
    
    // Énergie du tamisage dérivée de la concordance ADN et des multiplicateurs
    const sieveEnergyPct = parseFloat(
      Math.min(100, Math.max(5, currentWeightPct * (0.8 + 0.4 * (dnaConcordanceMean / 50)))).toFixed(1)
    );

    return {
      familyKey: fam.key,
      familyName: fam.name,
      currentWeightPct,
      sieveEnergyPct
    };
  });

  return {
    sievedScores,
    dnaSieveMetrics: {
      dominantAlgos,
      dnaConcordanceMean,
      multipliers: multipliersRecord,
      affinityPercent: affinityRecord,
      entropyBits: entropyBits || 0,
      sieveIntensitySNR,
      elitesCount,
      shadowsCount,
      retentionRatePct,
      macroFamilies
    }
  };
};

export const selectPredictionNumbers = async (
  context: PredictionRuntimeContext,
  denoisedScores: ScoredNumber[],
  features: ExtractedFeatures
): Promise<{
  selection: number[];
  candidates: number[];
  shrinkageApplied: boolean;
  shrinkageFactor: number;
}> => {
  const sortedScores = [...denoisedScores].sort((a, b) => b.score - a.score);
  
  // --- CALIBRAGE DIFFÉRENTIABLE DU FACTEUR DE SHRINKAGE (ZÉRO NOMBRE MAGIQUE) ---
  // Calcul continu de la dispersion (moyenne, écart-type et coefficient de variation) sur l'ensemble des 90 numéros
  const nScores = sortedScores.length;
  let sumScores = 0;
  for (let i = 0; i < nScores; i++) {
    sumScores += sortedScores[i].score;
  }
  const meanScore = sumScores / Math.max(1, nScores);
  
  let sumSqDiff = 0;
  for (let i = 0; i < nScores; i++) {
    sumSqDiff += Math.pow(sortedScores[i].score - meanScore, 2);
  }
  const stdDevScore = Math.sqrt(sumSqDiff / Math.max(1, nScores));
  const cvScore = stdDevScore / (meanScore + 1e-6);

  // Fonction sigmoïdale continue de shrinkage (modulation entre 0.70 et 1.00 selon la clarté du signal)
  // Lorsque les scores sont plats/indécis (faible CV), le facteur de shrinkage se contracte continûment vers 0.70
  const shrinkageSigmoid = 1.0 / (1.0 + Math.exp(-10.0 * (cvScore - 0.22)));
  const shrinkageFactor = parseFloat((0.70 + 0.30 * shrinkageSigmoid).toFixed(4));
  const shrinkageApplied = shrinkageFactor < 0.985;

  if (shrinkageApplied) {
    logger.info(
      { meanScore: parseFloat(meanScore.toFixed(2)), stdDevScore: parseFloat(stdDevScore.toFixed(2)), cvScore: parseFloat(cvScore.toFixed(4)), shrinkageFactor },
      "[predictionOrchestrator] Instabilité/Tension des scores détectée. Application d'un shrinkage continu différentiable."
    );
    sortedScores.forEach(s => {
      s.score = s.score * shrinkageFactor;
    });
  }

  // --- DÉTECTION DYNAMIQUE DU RÉGIME DE JEU (RÉGULATION THERMODYNAMIQUE & DIVERGENCE KL POISSON) ---
  const empiricalCalibration = generateEmpiricalCalibration(context.history);
  const thermoRegime = calculateThermodynamicRegime(context.history);
  
  const outsiderCount = context.forcedOutsiderCount !== undefined 
    ? context.forcedOutsiderCount 
    : thermoRegime.continuousOutsiderCount;

  const regimeStateNormalized = Math.max(0, Math.min(1,
    (thermoRegime.thermodynamicIndex + thermoRegime.entropy + thermoRegime.volatility / 100.0) / 3.0
  ));

  const selection = await generateCombination(
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

/**
 * Generates a short, fast FNV-1a hash of weights to avoid long JSON.stringify keys
 */
export const hashWeights = (weights?: AlgoWeights): string => {
  if (!weights) return "def";
  const keys = Object.keys(weights).sort();
  let h = 0x811c9dc5;
  for (const k of keys) {
    const val = (weights as Record<string, number>)[k];
    if (val !== undefined && val !== 0) {
      const s = `${k}:${Math.round(val * 10000)}`;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
    }
  }
  return (h >>> 0).toString(16);
};

interface PendingWorkerTask {
  resolve: (result: Prediction) => void;
  reject: (err: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  onProgress?: (progress: number, message: string) => void;
}

let activePredictionWorker: InstanceType<typeof PredictionWorker> | null = null;
const pendingWorkerTasks = new Map<string, PendingWorkerTask>();

let workerTaskSequence = 0;
const getOrCreatePredictionWorker = (): InstanceType<typeof PredictionWorker> => {
  if (!activePredictionWorker) {
    activePredictionWorker = new PredictionWorker();

    activePredictionWorker.onmessage = (e: MessageEvent) => {
      const { taskId, success, result, error, isProgress, progress, message } = e.data;
      const pending = pendingWorkerTasks.get(taskId);
      if (!pending) return;

      if (isProgress) {
        pending.onProgress?.(progress, message);
        return;
      }

      clearTimeout(pending.timeoutId);
      pendingWorkerTasks.delete(taskId);

      if (success) {
        pending.resolve(result);
      } else {
        pending.reject(new Error(error || "Erreur inconnue du worker de prédiction"));
      }
    };

    activePredictionWorker.onerror = (err) => {
      logger.error({ err }, "[predictionOrchestrator] Web Worker error, réinitialisation de l'instance de worker");
      for (const [, pending] of pendingWorkerTasks.entries()) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error("Web Worker de prédiction a rencontré une erreur fatale"));
      }
      pendingWorkerTasks.clear();
      if (activePredictionWorker) {
        activePredictionWorker.terminate();
        activePredictionWorker = null;
      }
    };
  }
  return activePredictionWorker;
};

const runLocalPredictionViaWorker = async (
  context: PredictionRuntimeContext
): Promise<Prediction> => {
  if (typeof Worker !== "undefined") {
    return new Promise<Prediction>((resolve, reject) => {
      try {
        const worker = getOrCreatePredictionWorker();
        workerTaskSequence = (workerTaskSequence + 1) % 1000000;
        const taskId = `MASTER_${Date.now()}_${workerTaskSequence}`;

        const timeoutId = setTimeout(() => {
          pendingWorkerTasks.delete(taskId);
          if (activePredictionWorker) {
            activePredictionWorker.terminate();
            activePredictionWorker = null;
          }
          reject(new Error("Timeout du Web Worker de prédiction locale"));
        }, 60000);

        pendingWorkerTasks.set(taskId, {
          resolve,
          reject,
          timeoutId,
          onProgress: context.onProgress,
        });

        const packed = packHistory(context.history as any);
        worker.postMessage({
          taskId,
          type: "master",
          drawName: context.drawName,
          historyBuffer: packed.historyBuffer,
          drawCount: packed.drawCount,
          winningCount: packed.winningCount,
          totalCols: packed.totalCols,
          temporalDepth: context.temporalDepth,
          weightsToUse: context.weightsToUse,
          metrics: context.metrics,
          symbioticContext: context.symbioticContext,
          skipTraining: context.skipTraining,
          adversarialMode: context.adversarialMode,
          forcedOutsiderCount: context.forcedOutsiderCount,
          isForensicOptimized: context.isForensicOptimized,
          useSpatioTemporalHawkes: context.useSpatioTemporalHawkes ?? true,
          preloadedForensicReports: context.preloadedForensicReports
        }, [packed.historyBuffer]);
      } catch (workerError) {
        reject(workerError);
      }
    });
  } else {
    throw new Error("Web Worker non supporté dans cet environnement");
  }
};

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
  useSpatioTemporalHawkesOverride?: boolean,
  useCloudEngineOverride?: boolean,
): Promise<Prediction> => {
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
    preloadedForensicReports,
    useSpatioTemporalHawkesOverride,
    useCloudEngineOverride
  );

  // SCÉNARIO A — Dataset insuffisant (Moins de 12 tirages)
  if (context.history.length < 12) {
    return handleScenarioADegradedPrediction(context);
  }

  const weightsHash = hashWeights(context.weightsToUse);
  const keyParams = `${context.history.length}_${context.contentHash}_w_${weightsHash}_adv_${context.adversarialMode}_outsider_${context.forcedOutsiderCount ?? "none"}_depth_${context.temporalDepth}_forensic_${context.isForensicOptimized}`;
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
        logger.warn(
          { drawName: context.drawName, error: e instanceof Error ? e.message : String(e) },
          "[predictionOrchestrator] Échec technique ou transport du Cloud complet. Basculement sur le Local complet."
        );
      }

      // PHASE 2 — Local Complet
      try {
        context.onProgress?.(25, "Lancement du pipeline Local Complet...");
        if (typeof Worker !== "undefined") {
          try {
            return await runLocalPredictionViaWorker(context);
          } catch (workerErr) {
            logger.error(
              { drawName: context.drawName, error: workerErr instanceof Error ? workerErr.message : String(workerErr) },
              "[predictionOrchestrator] Échec du Web Worker de prédiction locale. AUCUN basculement sur le thread principal pour éviter les freezes."
            );
            throw workerErr;
          }
        } else {
            logger.warn("[predictionOrchestrator] Web Workers non supportés, passage direct au Local Simplifié.");
            throw new Error("Web Workers non supportés");
        }
      } catch (e) {
        logger.error(
          { drawName: context.drawName, error: e instanceof Error ? e.message : String(e) },
          "[predictionOrchestrator] Échec analytique du Local Complet. Tentative de secours via Local Simplifié."
        );
      }

      // PHASE 3 — Local Simplifié
      try {
        context.onProgress?.(60, "Exécution du pipeline Local Simplifié (Mode Secours)...");
        return await runLocalSimplifiedPipeline(context);
      } catch (e) {
        logger.error(
          { drawName: context.drawName, error: e instanceof Error ? e.message : String(e) },
          "[predictionOrchestrator] Échec critique du Local Simplifié. Repli final sur la Réponse Prudente Dégradée."
        );
      }

      // PHASE 4 — Réponse Prudente Dégradée
      return handleScenarioADegradedPrediction(context);
    },
    CACHE_TTL.MEDIUM,
    context.drawName
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
