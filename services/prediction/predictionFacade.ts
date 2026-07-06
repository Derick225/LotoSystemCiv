import { DrawResult, Prediction, AlgoWeights, SymbioticContext, ForensicReport } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";
import { getAlgoWeights, normalizeWeights, applyMetaLearning, adjustWeightsForRegime, saveAlgoWeights } from "./weightsManager";
import { extractFeatures } from "./featureExtractor";
import { calculateScores, applyPCADenoising } from "./scoringEngine";
import { generateCombination } from "./combinationGenerator";
import { generateEmpiricalCalibration } from "./ticketAnalysisService";
import { calculateGeneticDiversityIndex } from "./diversityService";
import { getLocalForensicReports } from "../postPredictionAnalysisService";
import { logger } from "../../utils/logger";
import { EnhancedMetrics } from "./metrics.types";
import { initializeLcgForDraw } from "../../utils/mathUtils";
import {
  calculatePoissonScores, calculateBayesianScore, calculateTemporalScores,
  calculateDigitalRootAnalysis, calculateResistanceScores, calculateGapVelocityScores,
  calculateLeaderSuccession, calculateAiIntuition, calculateFractalResonance,
  calculateSpatialHotSpots, calculateCoOccurrenceScores, calculateAnomalyScores,
  calculateHawkesExcitation, calculateTopologicalLyapunov
} from "../advancedMathService";
import { detectGameRegime, calculateVolatility, calculateShannonEntropy } from "../mathService";
import { evaluateAdversarialSurvival } from "./adversarialProxy";
import { DNAOptimizer } from '../training/DNAOptimizer';
import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import { isSupabaseConfigured } from "../supabaseClient";
import { apiClient } from "../../core/api/apiClient";
import { calculateSpatioTemporalHawkes } from "../../utils/engine/hawkesEngine";

const TICKET_SIZE = 5;

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

const evaluatePredictionStability = (
  baseSelection: number[],
  features: any,
  weights: AlgoWeights,
  enhancedMetrics: any,
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
    // Perturbation proportionnelle à l'inverse du nombre d'algorithmes (Zéro nombre magique)
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
 * Micro-ajustement continu des poids par descente de gradient stochastique (SGD) déterministe.
 * Minimise la Perte de Cross-Entropy (Cross-Entropy Loss) des prédictions passées.
 */
export const applyDeterministicMicroSgd = async (
  drawName: string,
  weights: AlgoWeights,
  history: DrawResult[],
  entropyValue: number,
  learningRateOverride?: number,
  useSpatioTemporalHawkes: boolean = true
): Promise<AlgoWeights> => {
  let adjustedWeights = { ...weights };
  const K = Math.min(5, history.length - 1);
  if (K <= 0) return adjustedWeights;

  // Taux d'apprentissage continu indexé sur l'entropie de Shannon de l'historique (Zéro nombre magique)
  const baseEta = learningRateOverride !== undefined ? learningRateOverride : 0.015;
  const eta = baseEta * (1.0 - Math.pow(entropyValue, 2.0));

  // Boucle chronologique sur les K derniers tirages (du plus ancien au plus récent)
  for (let t = K - 1; t >= 0; t--) {
    const targetDraw = history[t];
    const subHistory = history.slice(t + 1);
    if (subHistory.length < 5) continue;

    const gagnants = targetDraw.gagnants;
    if (!gagnants || gagnants.length === 0) continue;

    try {
      // 1. Extraire les caractéristiques et métriques pour ce contexte passé
      const subPoisson = calculatePoissonScores(subHistory);
      const subBayes = calculateBayesianScore(subHistory);
      const subTemporal = calculateTemporalScores(subHistory);
      const subDigital = calculateDigitalRootAnalysis(subHistory);
      const subResistance = calculateResistanceScores(subHistory);
      const subGapVel = calculateGapVelocityScores(subHistory);
      const subLeader = calculateLeaderSuccession(subHistory);
      const subAi = calculateAiIntuition(subHistory, {});
      const subFractal = calculateFractalResonance(subHistory);
      const subSpatial = calculateSpatialHotSpots(subHistory);
      const subCo = calculateCoOccurrenceScores(subHistory);
      const subAnomaly = calculateAnomalyScores(subHistory);
      const subHawkes = useSpatioTemporalHawkes
        ? calculateSpatioTemporalHawkes(subHistory, drawName)
        : calculateHawkesExcitation(subHistory);
      const subLyapunov = calculateTopologicalLyapunov(subHistory);

      const subMetrics: EnhancedMetrics = {
        poisson: subPoisson,
        bayes: subBayes,
        temporal: subTemporal,
        digitalRoot: subDigital,
        resistance: subResistance,
        gapVelocity: subGapVel,
        leaderSuccession: subLeader,
        aiIntuition: subAi,
        fractalResonance: subFractal,
        spatial: subSpatial,
        coOccurrence: subCo,
        anomaly: subAnomaly,
        hawkes: subHawkes,
        lyapunov: subLyapunov
      };

      const subFeatures = await extractFeatures(drawName, subHistory);
      const scoredNumbers = calculateScores(subFeatures, adjustedWeights, subMetrics, subHistory);

      // 2. Calculer le softmax des scores prédits pour obtenir la distribution probabiliste
      let maxScore = -Infinity;
      scoredNumbers.forEach(s => {
        if (s.score > maxScore) maxScore = s.score;
      });

      let sumExp = 0;
      const expScores: Record<number, number> = {};
      scoredNumbers.forEach(s => {
        const expVal = Math.exp(s.score - maxScore); // stabilisation numérique du softmax
        expScores[s.num] = expVal;
        sumExp += expVal;
      });

      const probs: Record<number, number> = {};
      scoredNumbers.forEach(s => {
        probs[s.num] = sumExp > 0 ? expScores[s.num] / sumExp : 1.0 / 90.0;
      });

      // 3. Calculer les gradients de Cross-Entropy L1 par rapport aux poids
      // dL/d(w_a) = sum_{i=1}^{90} (p_i - y_i) * C_{i,a}
      // y_i = 0.2 pour les gagnants, 0 sinon (puisqu'il y a 5 gagnants)
      const gradients: Record<string, number> = {};
      const algoKeys = Object.keys(adjustedWeights);
      algoKeys.forEach(algo => { gradients[algo] = 0; });

      scoredNumbers.forEach(s => {
        const isWinner = gagnants.includes(s.num);
        const y_i = isWinner ? 0.2 : 0.0;
        const diff = probs[s.num] - y_i;

        algoKeys.forEach(algo => {
          const w_a = adjustedWeights[algo as AlgoKey] || 0;
          // C_{i,a} = shapValues_i(a) / w_a
          const shapVal = s.explainability?.shapValues?.[algo] || 0;
          const C_ia = w_a > 1e-6 ? shapVal / w_a : 0;
          gradients[algo] += diff * C_ia;
        });
      });

      // 4. Appliquer le pas de gradient et projeter sur le simplexe
      algoKeys.forEach(algo => {
        adjustedWeights[algo as AlgoKey] = Math.max(0, (adjustedWeights[algo as AlgoKey] || 0) - eta * gradients[algo]);
      });

      adjustedWeights = normalizeWeights(adjustedWeights);
    } catch (e) {
      // Échec silencieux sur un tirage particulier pour préserver la robustesse
    }
  }

  return adjustedWeights;
};

export const generateMasterPredictionCore = async (
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
  useSpatioTemporalHawkes: boolean = true,
  onProgress?: (progress: number, message: string) => void,
  preloadedForensicReports?: ForensicReport[],
): Promise<Prediction> => {
  const history = purifyHistoryForDraw(drawName, rawHistory);
  initializeLcgForDraw(drawName);
  if (history.length < 10) throw new Error("Dataset insuffisant pour convergence.");
  onProgress?.(5, "Initialisation de l'ADN algorithmique...");
  
  let weights = normalizeWeights(weightsToUse || (await getAlgoWeights(drawName)));
  const gameRegimeInfo = detectGameRegime(history);
  weights = adjustWeightsForRegime(weights, gameRegimeInfo);
  
  let hyperparameters = {
    hawkesDecay: 0.15,
    spatialSigma: 1.5,
    gapVelocityWeight: 1.0,
    bayesWindowRatio: 0.1,
    sgdLearningRate: 0.015,
    lyapunovHorizon: 15
  };
  let hyperTuningLog: string[] = [];
  let hyperAccuracyGain = 0;

  if (!skipTraining) {
    try {
      const { tunePredictiveHyperparameters } = await import("./hyperParameterTuner");
      const tunerResult = await tunePredictiveHyperparameters(drawName, history, weights, useSpatioTemporalHawkes, (p, msg) => {
        onProgress?.(Math.round(5 + p * 0.8), msg);
      });
      hyperparameters = tunerResult.tunedParams;
      hyperAccuracyGain = tunerResult.accuracyGain;
      hyperTuningLog = tunerResult.log;
    } catch (err) {
      logger.warn({ err }, "[predictionFacade] Hyper-parameter tuning failed, using defaults");
    }

    onProgress?.(45, "Micro-ajustement des poids par descente de gradient stochastique...");
    weights = await applyMetaLearning(weights, history, drawName);
    
    // MICRO-AJUSTEMENT CONTINU DES POIDS PAR DESCENTE DE GRADIENT STOCHASTIQUE DÉTERMINISTE (SGD)
    weights = await applyDeterministicMicroSgd(drawName, weights, history, gameRegimeInfo.entropy, hyperparameters.sgdLearningRate, useSpatioTemporalHawkes);
    await saveAlgoWeights(drawName, weights);
  }
  
  const localHistoryContext = history.slice(0, temporalDepth);
  onProgress?.(50, "Extraction des distributions de Poisson...");
  
  const poissonScores = calculatePoissonScores(localHistoryContext);
  onProgress?.(55, "Analyse des probabilités de transition bayésiennes...");
  const bayesScores = calculateBayesianScore(localHistoryContext);
  const temporalScores = calculateTemporalScores(localHistoryContext);
  const digitalRootScores = calculateDigitalRootAnalysis(localHistoryContext);
  const resistanceScores = calculateResistanceScores(localHistoryContext);
  const gapVelocityScores = calculateGapVelocityScores(localHistoryContext);

  // Appliquer le facteur d'échelle continu de l'hyper-paramètre de vélocité d'écart
  for (const k in gapVelocityScores) {
    gapVelocityScores[k] *= hyperparameters.gapVelocityWeight;
  }

  onProgress?.(65, "Synthèse des résonances fractales et processus Hawkes...");
  const leaderSuccessionScores = calculateLeaderSuccession(localHistoryContext);
  const aiIntuitionScores = calculateAiIntuition(localHistoryContext, (metrics || {}) as Record<string, unknown>);
  const fractalResonanceScores = calculateFractalResonance(localHistoryContext);
  
  onProgress?.(75, "Analyse des affinités symbiotiques et anomalies d'entropie...");
  const spatialHotSpots = calculateSpatialHotSpots(localHistoryContext);
  const symbioticClusterScores = calculateCoOccurrenceScores(localHistoryContext);
  const anomalyScores = calculateAnomalyScores(localHistoryContext);
  
  const hawkesExcitationScores = useSpatioTemporalHawkes
    ? calculateSpatioTemporalHawkes(localHistoryContext, drawName)
    : calculateHawkesExcitation(localHistoryContext);

  // Appliquer l'échelle continue du taux de processus de Hawkes
  for (const k in hawkesExcitationScores) {
    hawkesExcitationScores[k] *= (hyperparameters.hawkesDecay / 0.15);
  }

  const topologicalLyapunovScores = calculateTopologicalLyapunov(localHistoryContext);
  
  const volatilityObj = calculateVolatility(localHistoryContext);
  const entropyObj = calculateShannonEntropy(localHistoryContext);
  const volatilityScore = isNaN(volatilityObj.score) ? 50 : Math.max(0, Math.min(100, volatilityObj.score));
  const entropyScore = isNaN(entropyObj.normalized) ? 50 : Math.max(0, Math.min(100, entropyObj.normalized * 100));
  const regimeState = (volatilityScore + entropyScore) / 2;
  
  const entropyRegimeScores: Record<number, number> = {};
  const clusterBoosts: Record<number, number> = {};
  for (let i = 1; i <= 90; i++) {
    const freqVal = (metrics?.frequencies?.[i] || 0) * 10;
    entropyRegimeScores[i] = regimeState > 65 ? Math.max(0, 100 - freqVal) : Math.min(100, freqVal);
    clusterBoosts[i] = Math.max(0, symbioticClusterScores[i] || 0);
  }
  
  let recentReports: ForensicReport[] = [];
  if (!skipTraining || isForensicOptimized) {
    onProgress?.(85, "Double Aveugle : Alignement avec les rapports d'autopsie...");
    if (preloadedForensicReports) {
      recentReports = preloadedForensicReports;
    } else {
      const forensicReports = await getLocalForensicReports();
      // Double Aveugle : On filtre les rapports d'autopsie pour n'utiliser que ceux correspondant aux tirages présents dans l'historique actif
      const historyDates = new Set(history.map(h => h.date).filter(d => d !== 'Invalid Date' && d !== null && d !== undefined));
      recentReports = forensicReports.filter((r) => r.drawName === drawName && r.date !== 'Invalid Date' && r.date !== null && r.date !== undefined && historyDates.has(r.date)).slice(0, 5);
    }
  }
  
  const intermediateMetrics: EnhancedMetrics = {
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
    hawkesExcitation: hawkesExcitationScores,
    topologicalLyapunov: topologicalLyapunovScores
  };

  const features = await extractFeatures(drawName, history, temporalDepth);  
  // CRITICAL FIX: Pass intermediateMetrics to calculateScores so AlgorithmPlugins can read bayes, poisson, etc.
  const baseScoresRaw = calculateScores(features, weights, intermediateMetrics, history);
  const algoBreakdowns = baseScoresRaw.reduce(
    (acc, curr) => ({ ...acc, [curr.num]: curr.breakdown }),
    {} as Record<number, Record<string, number>>,
  );
  
  const proximityScores: Record<number, number> = {};
  const missedScores: Record<number, number> = {};
  const driftScores: Record<number, number> = {};
  const dynamicWeightModifiers: Record<number, Partial<Record<string, number>>> = {};
  
  const alphasDecades = new Float32Array(10).fill(1.0); // Prior pour la loi Multinomiale des Décades (Laplace smoothing)
  const alphasParity = new Float32Array(2).fill(1.0);   // Prior pour la loi Binomiale de Parité (Laplace smoothing)

  // Calcul des médianes et écarts-types pour remplacer les seuils magiques
  const allScores = baseScoresRaw.map(s => s.score);
  const medianScore = getMedian(allScores);
  const stdDevScore = getStdDev(allScores, medianScore);
  
  // Aggregate Oracle Drift
  const oracleDriftMap: Record<string, number> = {};

  recentReports.forEach((r) => {
    if (r.nearMisses) {
      r.nearMisses.forEach((nm) => {
        for (let i = 1; i <= 90; i++) {
          const distPredicted = Math.min(Math.abs(i - nm.predicted), 90 - Math.abs(i - nm.predicted));
          const distActual = Math.min(Math.abs(i - nm.actual), 90 - Math.abs(i - nm.actual));
          
          // Sigma dérivé de la topologie du domaine (90 / 30 = 3.0)
          const sigmaProximity = 90.0 / 30.0;
          const predictedWave = 1.0 * Math.exp(-(distPredicted * distPredicted) / (2.0 * sigmaProximity * sigmaProximity));
          const actualWave = 1.0 * (1.0 - Math.pow(distActual, 2) / Math.pow(sigmaProximity, 2)) * Math.exp(-Math.pow(distActual, 2) / (2.0 * Math.pow(sigmaProximity, 2)));
          
          // Formalisation Algorithmique Continue (Zéro bifurcation stricte)
          let specificCorrection = 0;
          
          // Gaussian for Voisin (distance optimale = 1)
          const diffVoisin = Math.abs(Math.abs(i - nm.predicted) - 1.0);
          const voisinAffinity = Math.exp(-Math.pow(diffVoisin, 2) / 0.5);
          
          // Gaussian for Miroir (symétrie 91 - x)
          const diffMiroir = Math.abs(i - (91 - nm.predicted));
          const miroirAffinity = Math.exp(-Math.pow(diffMiroir, 2) / 0.5);
          
          // Gaussian for Shadow (inversion digitale)
          const revNum = parseInt(nm.predicted.toString().split("").reverse().join(""));
          const validRev = revNum >= 1 && revNum <= 90 ? revNum : nm.predicted;
          const diffShadow = Math.abs(i - validRev);
          const shadowAffinity = Math.exp(-Math.pow(diffShadow, 2) / 0.5);
          
          // Application continue pondérée par les propriétés de régime (Zéro Nombre Magique)
          const structuralWeight = gameRegimeInfo.hurst + gameRegimeInfo.entropy;
          
          // Le poids est activé par le type de near-miss, mais la diffusion spatiale est continue sur [1..90]
          if (nm.errorType === "Voisin") specificCorrection += voisinAffinity * structuralWeight;
          if (nm.errorType === "Miroir") specificCorrection += miroirAffinity * structuralWeight;
          if (nm.errorType === "Shadow") specificCorrection += shadowAffinity * structuralWeight;
          
          proximityScores[i] = (proximityScores[i] || 0) + predictedWave + actualWave + specificCorrection;
        }
      });
    }
    if (r.missedSignals) {
      r.missedSignals.forEach((ms) => {
        const decadeMatch = ms.pattern.match(/Décade (\d)0s/);
        if (decadeMatch) {
          const d = parseInt(decadeMatch[1]);
          if (d >= 0 && d <= 9) {
            alphasDecades[d] += ms.significance;
          }
        }
        if (ms.pattern.includes("Pairs")) {
          alphasParity[0] += ms.significance;
        }
        if (ms.pattern.includes("Impairs")) {
          alphasParity[1] += ms.significance;
        }
      });
    }
    if (r.algorithmicDrift) {
      const driftValues = r.algorithmicDrift.map(d => d.driftScore);      const medianDrift = getMedian(driftValues);
    // @ts-ignore - auto generated by cleanup
      const stdDevDrift = getStdDev(driftValues, medianDrift);
      
      r.algorithmicDrift.forEach((drift) => {
        // Populating Forensic Oracle Drift (positif = surestimation, négatif = sous-estimation)
        const val = drift.direction === "overestimating" ? drift.driftScore : -drift.driftScore;
        oracleDriftMap[drift.algo] = (oracleDriftMap[drift.algo] || 0) + val;

        // CORRECTION : Pente de sigmoïde dérivée de l'inverse de l'écart-type de score (1.0 / stdDevScore) pour éviter l'arbitraire
        const scaleFactor = 1.0 / Math.max(1e-6, stdDevScore);
        const driftWeight = 1.0 / (1.0 + Math.exp(-scaleFactor * (drift.driftScore - medianDrift)));
        for (let i = 1; i <= 90; i++) {
          if (!driftScores[i]) driftScores[i] = 0;
          const algoScore = algoBreakdowns[i]?.[drift.algo] || 0;
          
          if (drift.direction === "underestimating") {
            const underestimationWeight = 1.0 / (1.0 + Math.exp(scaleFactor * (algoScore - medianScore)));
            const sigU = 1.0 / (1.0 + Math.exp(-scaleFactor * (medianScore - algoScore)));
            const diffRatio = (medianScore - algoScore) / Math.max(1e-6, medianScore);
            driftScores[i] += drift.driftScore * 0.5 * driftWeight * underestimationWeight * (sigU * diffRatio + (1.0 - sigU) * 0.5);
          } else if (drift.direction === "overestimating") {
            const overestimationWeight = 1.0 / (1.0 + Math.exp(-scaleFactor * (algoScore - (medianScore + stdDevScore))));
            const sigO = 1.0 / (1.0 + Math.exp(-scaleFactor * (algoScore - (medianScore + stdDevScore))));
            const diffRatio = (algoScore - (medianScore + stdDevScore)) / Math.max(1e-6, stdDevScore);
            driftScores[i] -= drift.driftScore * 0.5 * driftWeight * overestimationWeight * (sigO * diffRatio + (1.0 - sigO) * 0.5);
          }
        }
      });
    }
    if (r.z_scores && r.proposedAdjustments) {
      r.z_scores.forEach((z) => {
        // Seuil continu basé sur 1 écart-type (Z > 1.0)
        const zWeight = 1.0 / (1.0 + Math.exp(-3.0 * (Math.abs(z.z) - 1.0)));
        const num = z.number;
        if (!dynamicWeightModifiers[num]) dynamicWeightModifiers[num] = {};
        
        r.proposedAdjustments!.forEach((adj) => {
          if (!dynamicWeightModifiers[num][adj.algo]) dynamicWeightModifiers[num][adj.algo] = 0;
          dynamicWeightModifiers[num][adj.algo]! += adj.proposedWeightChange * Math.abs(z.z) * zWeight;
        });
      });
    }
  });

  // Calcul de la posterior conjointe Dirichlet-Multinomiale sur les catégories manquées
  // Permet de distribuer proprement la masse de probabilité sans constantes magiques arbitraires
  const sumDecades = alphasDecades.reduce((a, b) => a + b, 0);
  const sumParity = alphasParity.reduce((a, b) => a + b, 0);

  const getDecadeSize = (d: number): number => {
    if (d === 0) return 9;
    if (d === 9) return 1;
    return 10;
  };

  for (let i = 1; i <= 90; i++) {
    const d = Math.floor(i / 10);
    const pIdx = i % 2 === 0 ? 0 : 1;
    
    const pDecade = alphasDecades[d] / sumDecades;
    const pPar = alphasParity[pIdx] / sumParity;
    
    const baseDecade = getDecadeSize(d) / 90;
    const baseParity = 0.5;
    
    const weightDecade = pDecade / baseDecade;
    const weightParity = pPar / baseParity;
    
    const jointFactor = weightDecade * weightParity;
    
    // Log-odds de déviation conjointe normalisée, bornée pour éviter l'instabilité numérique
    missedScores[i] = Math.max(-3.0, Math.min(3.0, Math.log(jointFactor))) * 15.0;
  }
  
  const enhancedMetrics: EnhancedMetrics = {
    ...intermediateMetrics,
    proximityDiagnostic: proximityScores,
    missedModulator: missedScores,
    driftCorrection: driftScores,
    symbioticClusters: clusterBoosts,
    entropyRegime: entropyRegimeScores,
    anomalyDetection: anomalyScores,
    symbioticContext,
    dynamicWeightModifiers,
  };
  
  // --- DOUBLE PASS CONTINUOUS DNA CALIBRATION & RECALIBRATION ---
  // Pass 1: Run raw scoring evaluation to project the localized spatial breakdown features of the algorithms
  let masterScores = calculateScores(features, weights, enhancedMetrics, localHistoryContext);
  
  // Use these actual computed breakdowns to perform retroactive backpropagation calibration
  const feedbackOptimizer = new DNAOptimizer(Object.keys(weights) as AlgoKey[]);
  const feedbackBreakdowns = masterScores.reduce((acc, curr) => ({ ...acc, [curr.num]: curr.breakdown }), {} as Record<number, any>);
  
  // 15-draw rolling feedback window to prevent over-fitting (walk-forward coordinate descent)
  const bpDepth = Math.min(15, history.length);
  const breakdownsByDraw: Record<number, Record<number, Record<AlgoKey, number>>> = {};
  for (let d = 0; d < bpDepth; d++) {
    breakdownsByDraw[d] = feedbackBreakdowns; // Stationary local feature approximation to optimize mobile/CPU overhead
  }
  
  // Run Retroactive DNA backpropagation
  let calibratedWeights = feedbackOptimizer.backpropagateWeights(weights, history.slice(0, bpDepth), breakdownsByDraw, 0.05);

  // Reconstruct DNA vectors of historical winners based on target profile
  const fbHistoricalVectors: Float32Array[] = [];
  const fbSampleDepth = Math.min(30, history.length);
  for (let d = 0; d < fbSampleDepth; d++) {
      const winners = history[d]?.gagnants || [];
      for (const num of winners) {
          const bdown = feedbackBreakdowns[num];
          if (bdown) {
              const vec = new Float32Array(feedbackOptimizer['numAlgos']);
              feedbackOptimizer['algoKeys'].forEach((k, idx) => {
                  vec[idx] = bdown[k] || 0;
              });
              fbHistoricalVectors.push(vec);
          }
      }
  }

  if (fbHistoricalVectors.length >= 5) {
      try {
          const targetProfile = feedbackOptimizer.extractTargetDNAProfile(fbHistoricalVectors, fbSampleDepth);
          // Apply Kalman Filter (Optimiseur de Pension d'ADN - Anti-Dérive) on backpropagated parameters
          calibratedWeights = feedbackOptimizer.applyKalmanDriftCorrection(calibratedWeights, targetProfile, fbHistoricalVectors);
      } catch (err) {
          logger.warn({ err }, "[predictionFacade] Error in feedback calibration pass");
      }
  }

  // GRAVER LA CALIBRATION : Use the perfectly calibrated weights on-the-fly for prediction,
  // but DO NOT write them back to local storage (Auto-Save is disabled as per user specification).
  // Weights must only be mutated when clicking manual dedicated save or optimization buttons.
  weights = normalizeWeights(calibratedWeights);

  // Pass 2: Re-simulate Master Scores using the optimal, anti-drift calibrated weights map!
  masterScores = calculateScores(features, weights, enhancedMetrics, localHistoryContext);

  // --- JAMES-STEIN BAYESIAN SHRINKAGE REGULARIZATION ---
  let macroPriorScores: Record<number, number> | null = null;
  let macroPredBreakdown: Record<number, Record<string, number>> | null = null;
  let shrinkageApplied = false;
  let shrinkageFactorValue = 0;

  if (drawName !== "ALL_COMBINED" && drawName !== "ALL") {
    try {
      const { lotteryService } = await import("../lotteryService");
      const allHistory = await lotteryService.fetchHistory("ALL");
      if (allHistory && allHistory.length >= 10) {
        const macroPred = await generateMasterPrediction(
          "ALL_COMBINED",
          allHistory,
          temporalDepth,
          weightsToUse,
          undefined,
          undefined,
          true, // skip training for speed
          false,
          0
        );
        if (macroPred && macroPred.breakdown) {
          macroPriorScores = {};
          macroPredBreakdown = macroPred.breakdown;
          for (let i = 1; i <= 90; i++) {
            const bdown = macroPred.breakdown[i];
            if (bdown) {
              let macroScore = 0;
              let weightSum = 0;
              Object.entries(weights).forEach(([algo, w]) => {
                const val = bdown[algo as AlgoKey] || 0;
                macroScore += val * (w || 0);
                weightSum += (w || 0);
              });
              macroPriorScores[i] = weightSum > 0 ? (macroScore / weightSum) : 0;
            } else {
              macroPriorScores[i] = 0;
            }
          }
        }
      }
    } catch (e) {
      logger.warn({ err: e }, "[predictionFacade] Failed to fetch macro prior for Bayesian Shrinkage");
    }
  }

  const rawLocalScores = masterScores.map(s => ({ num: s.num, score: s.score }));
  let activeVerificationReport: any = null;

  if (macroPriorScores) {
    // Calculate S^2_local (variance of masterScores)
    const localScoresArr = masterScores.map(s => s.score);
    const localMean = localScoresArr.reduce((a, b) => a + b, 0) / localScoresArr.length;
    const s2Local = localScoresArr.reduce((a, b) => a + Math.pow(b - localMean, 2), 0) / localScoresArr.length;

    // Calculate MSE between local and macro
    let sumSqrDiff = 0;
    masterScores.forEach((score) => {
      const macroScore = macroPriorScores![score.num] || 0;
      sumSqrDiff += Math.pow(score.score - macroScore, 2);
    });
    const mse = sumSqrDiff / masterScores.length;

    // Compute continuous variance ratio
    const varianceRatio = s2Local / (s2Local + mse + 1e-6);
    
    // Continuous shrinkage factor derived from entropy instead of magic number
    const maxShrinkage = 1.0 - gameRegimeInfo.entropy;
    const B = maxShrinkage * (1.0 - varianceRatio);
    shrinkageFactorValue = B;
    shrinkageApplied = B > 1e-4;

    if (shrinkageApplied) {
      masterScores.forEach((score) => {
        const macroScore = macroPriorScores![score.num] || 0;
        score.score = (1.0 - B) * score.score + B * macroScore;

        // Maintain mathematical consistency across the breakdown
        const bdown = score.breakdown;
        const macroBdown = macroPredBreakdown![score.num];
        if (bdown && macroBdown) {
          Object.keys(bdown).forEach((algo) => {
            const localVal = bdown[algo as AlgoKey] || 0;
            const macroVal = macroBdown[algo as AlgoKey] || 0;
            bdown[algo as AlgoKey] = (1.0 - B) * localVal + B * macroVal;
          });
        }
      });
    }

    try {
      const { verifyActivePrediction } = await import("./shrinkageVerificationService");
      activeVerificationReport = verifyActivePrediction(
        drawName,
        rawLocalScores,
        masterScores,
        shrinkageFactorValue,
        gameRegimeInfo.entropy
      );
    } catch (err) {
      logger.warn({ err }, "[predictionFacade] Failed to run active shrinkage verification");
    }
  }

  const lastDrawGagnants = localHistoryContext[0]?.gagnants || [];
  
  const symbiosisValues = Object.values(enhancedMetrics.symbioticClusters || {}) as number[];
  const medianSymbiosis = getMedian(symbiosisValues);
  const stdDevSymbiosis = symbiosisValues.length > 0 ? getStdDev(symbiosisValues, medianSymbiosis) : 1.0;

  masterScores.forEach((score) => {
    let decay = 1.0;
    if (lastDrawGagnants.includes(score.num)) {
      // CORRECTION : Pente de décroissance basée sur l'écart-type normalisé, pas constantes fixes
      const normalizedScoreScale = 1.0 / Math.max(1e-6, stdDevScore / 100.0);
      decay = 1.0 / (1.0 + Math.exp(-normalizedScoreScale * ((score.score / 100.0) - (medianScore / 100.0))));
    }
    
    const symbiosisScore = enhancedMetrics.symbioticClusters?.[score.num] || 0;
    // CORRECTION : Modulation de symbiose calibrée continûment par l'écart-type de symbiose
    const symbiosisScaleFactor = 1.0 / Math.max(1e-6, stdDevSymbiosis);
    const maxSymbiosisBound = 1.0 / Object.keys(weights).length; // 1 / N
    const symbiosisMod = 1.0 + maxSymbiosisBound * (1.0 / (1.0 + Math.exp(-symbiosisScaleFactor * (symbiosisScore - medianSymbiosis))));
    
    score.score = score.score * decay * symbiosisMod;
  });
  
  let adversarialApplied = false;
  let challengedNumbers: number[] = [];
  if (adversarialMode) {
    const keyAlgos = [AlgoKey.FREQUENCY, AlgoKey.GAPS, AlgoKey.SPECTRAL, AlgoKey.MARKOV, AlgoKey.TEMPORAL, AlgoKey.BAYES, AlgoKey.FRACTAL, AlgoKey.SPATIAL, AlgoKey.MOMENTUM, AlgoKey.AFFINITY];
    
    const consensusMapping = masterScores.map((score) => {
      let continuousConsensus = 0;
      let sumVal = 0;
      keyAlgos.forEach((algo) => {
        const val = score.breakdown[algo] || 0;
        sumVal += val;
        const algoValues = masterScores.map(s => s.breakdown[algo] || 0);
        const medianAlgo = getMedian(algoValues);
        const stdDevAlgo = getStdDev(algoValues, medianAlgo);
        // CORRECTION : Échelle de la sigmoïde dérivée continûment de l'écart-type de score de l'algorithme (sans coefficient statique)
        continuousConsensus += 1.0 / (1.0 + Math.exp(-(1.0 / Math.max(1e-6, stdDevAlgo)) * (val - medianAlgo)));
      });
      return { num: score.num, continuousConsensus, meanVal: sumVal / keyAlgos.length, originalScore: score.score };
    });

    let hyperConsensusScoreMax = 0;
    const medianMeanVal = getMedian(consensusMapping.map(c => c.meanVal));

    // Dérivons l'échelle continue pour la fusion des consensus et de l'énergie moyenne
    const continuousConsensusValues = consensusMapping.map(c => c.continuousConsensus);
    const medianContinuousConsensus = getMedian(continuousConsensusValues);
    const stdDevContinuousConsensus = getStdDev(continuousConsensusValues, medianContinuousConsensus);
    const scaleConsensusSigmoid = 1.0 / Math.max(1e-6, stdDevContinuousConsensus);

    const scaleMeanValSigmoid = 1.0 / Math.max(1e-6, getStdDev(consensusMapping.map(c => c.meanVal), medianMeanVal));

    consensusMapping.forEach((c) => {
      // CORRECTION : Échelles de consensus continu ajustées dynamiquement sans coefficients arbitraires hachés
      const probConsensus = (1.0 / (1.0 + Math.exp(-scaleConsensusSigmoid * (c.continuousConsensus - medianContinuousConsensus)))) * (1.0 / (1.0 + Math.exp(-scaleMeanValSigmoid * (c.meanVal - medianMeanVal))));
      if (probConsensus > hyperConsensusScoreMax) hyperConsensusScoreMax = probConsensus;
      challengedNumbers.push(c.num);
      
      const scoreEntry = masterScores.find((s) => s.num === c.num);
      if (scoreEntry) {
        // L'impact max adversarial est plafonné à l'inverse du nombre d'algorithmes (1.0 / N) pour conservation-énergie
        const maxImpact = 1.0 / Object.keys(weights).length;
        const adversarialMultiplier = 1.0 - maxImpact * probConsensus;
        scoreEntry.score *= adversarialMultiplier;
         
        const antiConsensusVal = scoreEntry.breakdown[AlgoKey.FRACTAL] || 0;
        const entropyRegimeVal = scoreEntry.breakdown[AlgoKey.SPECTRAL] || 0;
        const stochasticVal = scoreEntry.breakdown[AlgoKey.SPATIAL] || 0;
        const anomalyVal = scoreEntry.breakdown[AlgoKey.BAYES] || 0;
        const alternativeStrength = (antiConsensusVal + entropyRegimeVal + stochasticVal + anomalyVal) / 4;
        
        const altStrengths = masterScores.map(s => ((s.breakdown[AlgoKey.FRACTAL] || 0) + (s.breakdown[AlgoKey.SPECTRAL] || 0) + (s.breakdown[AlgoKey.SPATIAL] || 0) + (s.breakdown[AlgoKey.BAYES] || 0)) / 4);
        const medianAltStrength = getMedian(altStrengths);
        const stdDevAltStrength = getStdDev(altStrengths, medianAltStrength);
        const scaleAltSigmoid = 1.0 / Math.max(1e-6, stdDevAltStrength);
        
        const boostProb = 1.0 / (1.0 + Math.exp(-scaleAltSigmoid * (alternativeStrength - medianAltStrength)));
        // CORRECTION : Multiplicateur alternatif proportionnel au même coefficient d'impact topologique amorti
        const alternativeMultiplier = 1.0 + maxImpact * boostProb * (1.0 - probConsensus);
        scoreEntry.score *= alternativeMultiplier;
      }
    });
    
    challengedNumbers = challengedNumbers.sort((a, b) => {
      const c1 = consensusMapping.find((c) => c.num === a);
      const c2 = consensusMapping.find((c) => c.num === b);
      const p1 = c1 ? (1.0 / (1.0 + Math.exp(-scaleConsensusSigmoid * (c1.continuousConsensus - medianContinuousConsensus)))) * (1.0 / (1.0 + Math.exp(-scaleMeanValSigmoid * (c1.meanVal - medianMeanVal)))) : 0;
      const p2 = c2 ? (1.0 / (1.0 + Math.exp(-scaleConsensusSigmoid * (c2.continuousConsensus - medianContinuousConsensus)))) * (1.0 / (1.0 + Math.exp(-scaleMeanValSigmoid * (c2.meanVal - medianMeanVal)))) : 0;
      return p2 - p1;
    }).slice(0, 3);
    
    adversarialApplied = hyperConsensusScoreMax > 0.5;
  }
  
  if (recentReports.length > 0) {
    // CORRECTION : Calculons les adjusted scores pour tous les éléments afin de déduire leur médiane et écart-type de façon rigoureuse
    const adjustedScoresMap = new Map<number, number>();
    masterScores.forEach((score) => {
      const raw = score.score;
      let forensicDrift = driftScores[score.num] || 0;
      let proxScore = proximityScores[score.num] || 0;
      let missed = missedScores[score.num] || 0;
      const bayesianImpact = enhancedMetrics.bayes?.[score.num] || 50;
      const poissonImpact = enhancedMetrics.poisson?.[score.num] || 50;
      
      const impacts = [bayesianImpact, poissonImpact, proxScore, forensicDrift];
      const avgImpact = impacts.reduce((a, b) => a + b, 0) / impacts.length;
      const varImpact = impacts.reduce((a, b) => a + Math.pow(b - avgImpact, 2), 0) / impacts.length;
      // Normalisation du de-weighting par l'échelle 100% de modulation
      const weightMod = 1.0 / (1.0 + Math.sqrt(varImpact) / 100.0);

      const trueProbabilityExp = (Math.exp((bayesianImpact - 50) / 50) + Math.exp((poissonImpact - 50) / 50)) / 2;
      let adjustedScore = raw * trueProbabilityExp;
      
      // Amortisseur Cybernétique Continu du Multiplicateur Forensic (Anti-Overfitting)
      // On régule continuellement la modulation en fonction du volume d'audits passés et de la volatilité de l'échantillon
      const N_reports = recentReports.length;
      const baseDamping = 1.0 / (1.0 + Math.exp(-1.5 * (N_reports - 2.5)));
      const volatility = typeof (enhancedMetrics as any).volatility === 'number' ? (enhancedMetrics as any).volatility : 0.5;
      const cyberneticDamping = Math.exp(-0.5 * volatility); // Facteur continu dans [0.0, 1.0]

      const forensicMultiplier = isForensicOptimized
        ? 1.0 + 1.5 * baseDamping * cyberneticDamping
        : 1.0;
      
      // Amortisseurs continus fondés sur la dimension de l'espace statistique d'algorithmes (1.0 / N)
      const baseShare = 1.0 / Object.keys(weights).length;
      adjustedScore += (forensicDrift * baseShare + proxScore * baseShare + missed * baseShare) * weightMod * forensicMultiplier;
      adjustedScoresMap.set(score.num, adjustedScore);
    });

    const adjustedValues = Array.from(adjustedScoresMap.values());
    const medianAdjusted = getMedian(adjustedValues);
    const stdDevAdjusted = getStdDev(adjustedValues, medianAdjusted);
    const adjustedScale = 1.0 / Math.max(1e-6, stdDevAdjusted);

    masterScores.forEach((score) => {
      const adScore = adjustedScoresMap.get(score.num) || 50;
      // Normalisation sigmoïdale continue centrée sur la médiane des adjusted scores réels
      score.score = 100.0 * (1.0 / (1.0 + Math.exp(-adjustedScale * (adScore - medianAdjusted))));
    });
  }
  
  onProgress?.(95, "Formulation finale et sélection des combinaisons...");
  masterScores = await applyPCADenoising(masterScores, weights, enhancedMetrics);
  const sortedScores = masterScores.sort((a, b) => b.score - a.score);  
  const outsiderCount = forcedOutsiderCount !== undefined ? forcedOutsiderCount : 2;
  const empiricalCalibration = generateEmpiricalCalibration(history);
  const selection = generateCombination(sortedScores, features.affinityMap, empiricalCalibration, outsiderCount, history[0]?.gagnants, regimeState);
  
  let averageScore = sortedScores.slice(0, TICKET_SIZE).reduce((a, b) => a + (b.score || 0), 0) / TICKET_SIZE;
  if (isNaN(averageScore) || averageScore <= 0) averageScore = 45;
  onProgress?.(100, "Convergence de l'ADN algorithmique atteinte !");
  
  let analysisText = adversarialApplied
    ? `Prédiction Oracle Base filtrée par le Protocole Adversarial Anti-Consensus (cibles hyper-consensuelles [${challengedNumbers.join(", ")}] modérées pour briser le cercle algorithmique de sédimentation d'ADN).`
    : `Prédiction Oracle Base générée en temps réel en s'appuyant rigoureusement sur l'ADN Algorithmique complet du moment, ajustée par l'historique de convergence.`;
    
  if (shrinkageApplied) {
    analysisText += ` Intégration d'un Prior Bayésien continu (James-Stein Shrinkage, B = ${Math.round(shrinkageFactorValue * 100)}%) pour régulariser les fluctuations locales via la macro-convergence globale.`;
  }
    
  const stabilityScore = evaluatePredictionStability(selection, features, weights, enhancedMetrics, localHistoryContext);
  
  const breakdownRecord = masterScores.reduce((acc, curr) => ({ ...acc, [curr.num]: curr.breakdown }), {} as Record<number, any>);
  const diversityMetrics = calculateGeneticDiversityIndex(selection, breakdownRecord);

  // --- XAP: Explainable Attribution Prediction via DNAOptimizer ---
  const optimizer = new DNAOptimizer(Object.keys(weights) as AlgoKey[]);
  const dnaMatrix = selection.map(num => {
      const bdown = breakdownRecord[num] || {};
      const vec = new Float32Array(optimizer['numAlgos']);
      optimizer['algoKeys'].forEach((k, i) => { vec[i] = bdown[k] || 0; });
      return vec;
  });

  // Reconstruct DNA vectors of historical winners based on current breakdown maps to form target profile
  const historicalVectors: Float32Array[] = [];
  const sampleDepth = Math.min(30, history.length);
  for (let i = 0; i < sampleDepth; i++) {
      const winners = history[i]?.gagnants || [];
      for (const num of winners) {
          const bdown = breakdownRecord[num];
          if (bdown) {
              const vec = new Float32Array(optimizer['numAlgos']);
              optimizer['algoKeys'].forEach((k, idx) => {
                  vec[idx] = bdown[k] || 0;
              });
              historicalVectors.push(vec);
          }
      }
  }

  let calculatedAlignment = 82; // standard medium alignment fallback
  if (historicalVectors.length >= 5) {
      try {
          const targetProfile = optimizer.extractTargetDNAProfile(historicalVectors, sampleDepth);
          const evaluation = optimizer.evaluateCandidate(
              dnaMatrix, 
              targetProfile, 
              selection, 
              history.slice(0, sampleDepth).map(d => d.gagnants)
          );
          // Scale from distance to continuous alignment index [10, 99] 
          // KL Div & Cosine distance usually result in sum index < 1.0; 
          // map it with a continuous sigmoid-like or inverse function to preserve high fidelity.
          calculatedAlignment = Math.min(99, Math.max(10, Math.round((1.0 / (1.0 + evaluation.distance)) * 105)));
      } catch (err) {
          logger.warn({ err }, "[predictionFacade] Error calculating continuous DNA alignment");
      }
  }

  const xapCandidate = {
      numbers: selection,
      dnaMatrix,
      synergyVector: new Float32Array(optimizer['numAlgos']), // dummy
      distance: 1.0 - (calculatedAlignment / 100),
      diversityScore: diversityMetrics.diversityScore
  };
  const xapExp = optimizer.generateXAP(xapCandidate, selection);
  
  // -- VÉRIFICATION ANTAGONISTE DÉTERMINISTE (G.A.PROXY) --
  // Synchronisation Holistique de la G.A Proxy avec le Forensic Oracle
  const proxyValidation = evaluateAdversarialSurvival(selection, breakdownRecord, history, oracleDriftMap);

  const explainabilityData = masterScores.reduce((acc, curr) => {
    if (curr.explainability) acc[curr.num] = curr.explainability;
    return acc;
  }, {} as Record<number, any>);

  return {
    suggestedNumbers: selection,
    candidates: sortedScores.slice(5, 15).map((s) => s.num),
    confidence: Math.min(99, Math.max(1, Math.round(averageScore))),
    analysis: analysisText,
    breakdown: breakdownRecord,
    timestamp: Date.now(),
    symbiosisFactor: symbioticContext ? 1.5 : 1.0,
    realityAlignment: calculatedAlignment,
    adversarialApplied,
    challengedNumbers,
    stabilityScore,
    diversityMetrics,
    xapExp,
    adversarialSurvivalScore: proxyValidation.survivalScore,
    adversarialRisks: proxyValidation.risks,
    explainabilityData,
    shrinkageApplied,
    shrinkageFactor: shrinkageFactorValue,
    shrinkageVerification: activeVerificationReport,
    hyperparameters,
    hyperTuningLog,
    hyperAccuracyGain
  };
};

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
): Promise<Prediction> => {
  const history = purifyHistoryForDraw(drawName, rawHistory);
  const keyParams = `${history.length}_${history[0]?.date}_${weightsToUse ? JSON.stringify(weightsToUse) : "def"}_adv_${adversarialMode}_forcedOutsider_${forcedOutsiderCount !== undefined ? forcedOutsiderCount : "none"}_depth_${temporalDepth}_forensic_${isForensicOptimized}`;
  const cacheKey = globalCache.generateKey('prediction', drawName, keyParams);
  
  return globalCache.getOrCompute(
    cacheKey,
    async () => {
      let useCloudEngine = true;
      let useSpatioTemporalHawkes = true;
      try {
        const { useNexusStore } = await import("../../store/useNexusStore");
        useCloudEngine = useNexusStore.getState().useCloudEngine;
        useSpatioTemporalHawkes = useNexusStore.getState().useSpatioTemporalHawkes;
      } catch (err) {
        // Fallback safe outside main-thread
      }

      // 1. Try cloud delegation first if enabled & configured
      if (useCloudEngine && isSupabaseConfigured() && drawName !== "ALL_COMBINED" && drawName !== "ALL") {
        try {
          console.log(`[CLOUD COMPUTING] Délégation de la prédiction ${drawName} vers Supabase Edge Function (predict-elite)...`);
          // Format the fractal metric array into a record structure matching what the Edge Function expects (z.record(z.number()))
          const formattedFractal: Record<number, number> = {};
          if (metrics && Array.isArray(metrics.fractal)) {
            metrics.fractal.forEach((f) => {
              if (f && typeof f.number === 'number' && typeof f.hurst === 'number') {
                formattedFractal[f.number] = f.hurst;
              }
            });
          }

          const result = await apiClient.post<Prediction>('predict-elite', {
            drawName,
            history,
            weights: weightsToUse,
            symbioticContext: symbioticContext ? {
              spatialHotZones: symbioticContext.spatialHotZones || []
            } : undefined,
            metrics: metrics ? {
              fractal: formattedFractal
            } : undefined
          });
          if (result && result.suggestedNumbers && result.suggestedNumbers.length > 0) {
            console.log(`[CLOUD COMPUTING] Prédiction ${drawName} obtenue avec succès depuis le Cloud !`);
            return result;
          }
        } catch (e) {
          console.warn("[CLOUD COMPUTING] Échec de la prédiction Cloud, basculement sur le moteur local.", e);
        }
      }

      // 2. Try offloading to Web Worker to keep main thread fluid (60fps UI)
      if (typeof Worker !== 'undefined') {
        try {
          const preloadedForensicReports = await getLocalForensicReports();
          return await new Promise<Prediction>((resolve, reject) => {
            const worker = new Worker(
              new URL('../workers/prediction.worker.ts', import.meta.url),
              { type: 'module' }
            );

            const timeoutId = setTimeout(() => {
              worker.terminate();
              reject(new Error("Timeout du Web Worker de prédiction locale"));
            }, 60000);

            worker.onmessage = (e: MessageEvent) => {
              const { success, result, error, isProgress, progress, message } = e.data;
              if (isProgress) {
                onProgress?.(progress, message);
                return;
              }
              clearTimeout(timeoutId);
              if (success) {
                resolve(result);
              } else {
                reject(new Error(error || "Erreur inconnue du worker de prédiction"));
              }
              worker.terminate();
            };

            worker.onerror = (err) => {
              clearTimeout(timeoutId);
              reject(err);
              worker.terminate();
            };

            worker.postMessage({
              taskId: `PREDICT_${Date.now()}`,
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
              useSpatioTemporalHawkes,
              preloadedForensicReports
            });
          });
        } catch (workerError) {
          console.warn("[WORKER] Échec d'instanciation ou d'exécution du worker de prédiction. Fallback sur thread principal.", workerError);
        }
      }

      return generateMasterPredictionCore(drawName, history, temporalDepth, weightsToUse, metrics, symbioticContext, skipTraining, adversarialMode, forcedOutsiderCount, isForensicOptimized, useSpatioTemporalHawkes, onProgress);
    },
    CACHE_TTL.MEDIUM,
    drawName
  );
};

