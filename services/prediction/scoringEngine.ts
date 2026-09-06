import { AlgoWeights, ScoreBreakdown, AlgoKey } from "../../shared/prediction.types";
import { calculateMicroDNAPerNumber } from "./microDnaService";
import { sigmoid } from "./deterministicCore";
import { ExtractedFeatures } from "./featureExtractor";
import { denoiseFeaturesKernelPCA_wrapper } from "../mathService";
import type { DrawResult } from "../../types";
import { algorithmRegistry, AlgorithmContext } from "./algorithmRegistry";
import './coreAlgorithms';
import { EnhancedMetrics } from './metrics.types';
import { normalizeWeights } from "./weightsManager";
import { logger } from "../../utils/logger";
import { calculateCyclicPhaseProfileMatrix } from "./dynamicProfileMatrix";
import { parseDateSafely } from "../../utils/dateUtils";

export interface ScoredNumber {
  num: number;
  score: number;
  breakdown: ScoreBreakdown;
  explainability?: {
    shapValues: Record<string, number>; // Contribution of each algo to the final score (0-100)
    topologicalTension: number;
    dnaOrbitingIndex: number;
    narrativeInterpretation?: string;
  };
}

const LOGISTIC_APPROX_FACTOR = 1.702; // Constante mathématique fondamentale (Minimax CDF Normale)

const getMedian = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const getMAD = (arr: number[], median: number): number => {
  if (arr.length === 0) return 0;
  const absDeviations = arr.map(v => Math.abs(v - median));
  const mad = getMedian(absDeviations);
  return mad * 1.4826; // Facteur de consistance pour distribution normale
};

const getModifiedZScore = (val: number, median: number, mad: number): number => {
  return (0.6745 * (val - median)) / (mad + Number.EPSILON);
};

export const calculateScores = (
  features: ExtractedFeatures,
  weights: AlgoWeights,
  advancedMetrics: EnhancedMetrics,
  history: DrawResult[],
  confidenceLevel: number = 0.90 // Paramètre mathématique au lieu de 0.05/0.95 en dur
): ScoredNumber[] => {
  const N = 90;
  const context: AlgorithmContext = {
    features,
    advancedMetrics,
    history,
    drawName: history[0]?.drawName || '',
    weights: { ...weights },
    algoWeights: { ...weights },
    statisticalBounds: advancedMetrics.statisticalBounds || { median: 0, q1: 0, q3: 0, variance: 0, kurtosis: 0, skewness: 0, shannonEntropy: 0, hurstExponent: 0.5 },
    deterministicSeed: history.length > 0 ? parseDateSafely(history[0].date).getTime() : 1234567890,
    maxFreq: Math.max(1, ...Array.from(features.freqMap || [])),
    maxMarkov: Math.max(0.001, ...Array.from(features.markovMap || [])),
    maxMachineTransfer: Math.max(0.001, ...Array.from(features.machineTransferMap || []))
  };

  // PRÉCALCUL DE RENDEMENT PHÉNOMÉNAL POUR TOUS LES PLUGINS UNIFIÉS (Séparation des responsabilités & Optimisation temporelle)
  context.pluginCache = {};
  algorithmRegistry.forEach(plugin => {
    try {
      if (typeof plugin.precompute === 'function') {
        plugin.precompute(context);
      }
    } catch (e) {
      logger.error({ err: e }, `[PRECOMPUTE ERROR] Failed to precompute for plugin ${plugin.key}`);
    }
  });

  const failedAlgos = new Set<string>();
  let effectiveWeights = { ...weights };
  const hasMachineDataInHistory = history.some(d => Array.isArray(d.machine) && d.machine.length > 0);
  if (!hasMachineDataInHistory) {
    effectiveWeights[AlgoKey.MACHINE_TRANSFER] = 0;
  }
  const rawBreakdowns: Record<number, ScoreBreakdown> = {};
  const algoValues: Record<string, number[]> = {};
  Object.values(AlgoKey).forEach(k => { algoValues[k] = []; });

  // Étape 1 & 2 : Évaluation brute avec résilience
  for (let i = 1; i <= N; i++) {
    const num = i;
    rawBreakdowns[num] = {} as ScoreBreakdown;
    algorithmRegistry.forEach(plugin => {
      try {
        const res = plugin.evaluate(num, context);
        const val = res.score;
        if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) throw new Error(`Valeur non numérique: ${val}`);
        rawBreakdowns[num][plugin.key] = val;
        if (!failedAlgos.has(plugin.key)) algoValues[plugin.key].push(val);
      } catch (err) {
        failedAlgos.add(plugin.key);
        rawBreakdowns[num][plugin.key] = 0;
      }
    });
  }

  if (failedAlgos.size > 0) {
    let sumFailedWeights = 0;
    let sumActiveWeights = 0;
    Object.keys(effectiveWeights).forEach(k => {
      const key = k as AlgoKey;
      if (failedAlgos.has(key)) {
        sumFailedWeights += Number(effectiveWeights[key]) || 0;
        effectiveWeights[key] = 0;
      } else {
        sumActiveWeights += Number(effectiveWeights[key]) || 0;
      }
    });

    if (sumFailedWeights > 0 && sumActiveWeights > 0) {
      Object.keys(effectiveWeights).forEach(k => {
        const key = k as AlgoKey;
        if (!failedAlgos.has(key)) {
          const propShare = (Number(effectiveWeights[key]) || 0) / sumActiveWeights;
          effectiveWeights[key] += sumFailedWeights * propShare;
        }
      });
      effectiveWeights = normalizeWeights(effectiveWeights);
      logger.warn(`[Dynamic Fallback] Redistribution de ${sumFailedWeights.toFixed(4)} sur les algos sains.`);
    }
  }

  // Étape 3 : Calcul des statistiques robustes (Médiane & MAD) par algo sain
  const algoRobustStats: Record<string, { median: number; mad: number }> = {};
  Object.keys(algoValues).forEach(k => {
    if (failedAlgos.has(k)) return;
    const vals = algoValues[k];
    if (!vals || vals.length === 0) return;
    algoRobustStats[k] = { median: getMedian(vals), mad: getMAD(vals, getMedian(vals)) };
  });

  // Étape 3.5 : Pré-calcul du Profilage Micro-ADN pour Modulation Comportementale Continue
  const targetDrawName = history[0]?.drawName || "ALL";
  const microDnaCache: Record<number, number> = {};
  if (history.length > 0) {
    for (let i = 1; i <= N; i++) {
        // Extraction du code comportemental du numéro pour l'injection via son spectralPower
        const microDna = calculateMicroDNAPerNumber(targetDrawName, i, history, effectiveWeights as Record<string, number>);
        microDnaCache[i] = microDna.spectralPower;
    }
  }

  // Constantes d'activation mathématique dérivées de la théorie
  const RESONANCE_BASE = 1.0;
  
  // L'amplitude de résonance est déduite de l'exposant de Hurst (mémoire longue)
  const H = context.statisticalBounds?.hurstExponent || 0.5;
  const RESONANCE_AMPLITUDE_MAX = Math.max(0, H);

  // Matrice de profil cyclique (Attracteur Périodique vs Dispersion Stochastique)
  const cyclicProfile = calculateCyclicPhaseProfileMatrix(
    history,
    context.advancedMetrics?.topologicalLyapunov as Record<number, number>
  );

  // Étape 4 : Z-Score Robuste, Sigmoïde Logistique & Résonance Micro-ADN
  const masterScores: ScoredNumber[] = [];
  for (let i = 1; i <= N; i++) {
    const num = i;
    const breakdown = rawBreakdowns[num];
    let finalScore = 0;
    const shapValues: Record<string, number> = {};
    
    // Gradient multiplicatif de résonance continue selon le Micro-ADN du numéro
    const microDnaResonanceModulator = microDnaCache[num] 
        ? RESONANCE_BASE + (sigmoid(microDnaCache[num], RESONANCE_BASE, 0.5) * RESONANCE_AMPLITUDE_MAX) 
        : RESONANCE_BASE;

    Object.keys(effectiveWeights).forEach((k) => {
      const key = k as AlgoKey;
      let baseWeight = Number(effectiveWeights[key]) || 0;
      const weightModifier = context.advancedMetrics?.dynamicWeightModifiers?.[num]?.[key] || 0;
      const cyclicModifier = cyclicProfile.algoWeightModifiers[key] || 0.0;
      
      // La base prend l'Exponentielle de manière continue (modifiers + phase cyclique)
      baseWeight *= Math.exp(weightModifier + cyclicModifier);
      
      // On multiplie par la résonance du Micro-ADN local pour ce numéro
      baseWeight *= microDnaResonanceModulator;

      const val = Number(breakdown[key]) || 0;
      if (baseWeight > 0 && !failedAlgos.has(key) && algoRobustStats[key]) {
        const stats = algoRobustStats[key];
        const robustZ = getModifiedZScore(val, stats.median, stats.mad);
        const squashed = 1.0 / (1.0 + Math.exp(-LOGISTIC_APPROX_FACTOR * robustZ)); // CDF Logistique standard de la loi Normale
        const contribution = squashed * baseWeight;
        finalScore += contribution;
        shapValues[key] = contribution;
      } else {
        shapValues[key] = 0;
      }
    });

    // Extract topology tension and dna index
    const dnaOrbitingIndex = microDnaCache[num] || 0;
    const topologicalTension = context.advancedMetrics?.topologicalTension?.[num] || 0;

    masterScores.push({ 
        num, 
        score: isNaN(finalScore) ? 0 : finalScore, 
        breakdown,
        explainability: {
            shapValues,
            topologicalTension,
            dnaOrbitingIndex
        }
    });
  }

  // Étape 5 : Normalisation Finale Robuste (Percentiles Dynamiques)
  const allScores = masterScores.map(m => m.score).sort((a, b) => a - b);
  const alpha = 1.0 - confidenceLevel;
  const pLowIndex = Math.floor(allScores.length * (alpha / 2.0));
  const pHighIndex = Math.floor(allScores.length * (1.0 - (alpha / 2.0)));
  
  const minS = allScores[pLowIndex] !== undefined ? allScores[pLowIndex] : allScores[0];
  const maxS = allScores[pHighIndex] !== undefined ? allScores[pHighIndex] : allScores[allScores.length - 1];
  const range = Math.max(Number.EPSILON, maxS - minS);

  masterScores.forEach((m) => {
    const normalized = ((m.score - minS) / range) * 100;
    m.score = Math.max(0, Math.min(100, normalized));
    
    // Normalize SHAP values to represent percentage of the final score contribution (0-100 sum roughly)
    const totalShap = Object.values(m.explainability?.shapValues || {}).reduce((a, b) => a + b, 0);
    if (totalShap > 0 && m.explainability) {
        Object.keys(m.explainability.shapValues).forEach(k => {
            m.explainability!.shapValues[k] = (m.explainability!.shapValues[k] / totalShap) * m.score;
        });
    }
  });

  return masterScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.num - b.num;
  });
};

export const applyPCADenoising = async (
  masterScores: ScoredNumber[],
  weights: AlgoWeights,
  enhancedMetrics?: EnhancedMetrics,
  confidenceLevel: number = 0.90
): Promise<ScoredNumber[]> => {
  const featureKeys = Object.keys(weights) as Array<AlgoKey>;
  try {
    const featureMatrix = masterScores.map((item) => featureKeys.map((k) => Number(item.breakdown[k]) || 0));
    const varThreshold = enhancedMetrics?.pcaVarianceThreshold as number | undefined;
    const denoisedMatrix = denoiseFeaturesKernelPCA_wrapper(featureMatrix, undefined, varThreshold);
    
    if (denoisedMatrix && denoisedMatrix.length === masterScores.length) {
      let mse = 0;
      let maxVal = 0;
      
      for(let i = 0; i < featureMatrix.length; i++){
        for(let j = 0; j < featureMatrix[i].length; j++) {
          const diff = featureMatrix[i][j] - (denoisedMatrix[i][j] || featureMatrix[i][j]);
          mse += diff * diff;
          if (Math.abs(featureMatrix[i][j]) > maxVal) maxVal = Math.abs(featureMatrix[i][j]);
        }
      }
      
      const totalElements = Math.max(1, featureMatrix.length * featureMatrix[0].length);
      const relativeMSE = mse / (totalElements * Math.max(Number.EPSILON, Math.pow(maxVal, 2)));

      // Facteur de dimensionalité corrigé (suppression de la division arbitraire par 2.0)
      const dimensionalityFactor = featureKeys.length;
      const pcaConfidence = Math.exp(-relativeMSE * Math.max(1, dimensionalityFactor));

      masterScores.forEach((item, idx) => {
        featureKeys.forEach((key, fIdx) => {
          const rawVal = featureMatrix[idx][fIdx];
          const dval = Number(denoisedMatrix[idx]?.[fIdx]);
          const cleanDVal = isNaN(dval) ? rawVal : dval;
          const blended = rawVal + pcaConfidence * (cleanDVal - rawVal);
          // La reconstruction PCA (régression linéaire dans un sous-espace réduit) peut
          // dépasser l'intervalle [0, 100] que chaque algorithme garantit pourtant en sortie
          // (confirmé empiriquement : gap_sequence et derived_neighbor ressortaient parfois
          // négatifs après ce blend, alors que leur sortie brute était toujours dans [0, 100]).
          item.breakdown[key] = Math.max(0, Math.min(100, blended));
        });
      });
      
      // Recalcul des scores avec les features fondées sur des lois statistiques exactes
      masterScores.forEach(m => {
          m.score = 0; // Reset
          if (m.explainability) {
             m.explainability.shapValues = {};
          }
      });
      
      featureKeys.forEach(k => {
        const vals = masterScores.map(m => Number(m.breakdown[k]) || 0);
        const median = getMedian(vals);
        const mad = getMAD(vals, median);
        
        masterScores.forEach(m => {
          const val = Number(m.breakdown[k]) || 0;
          let weight = Number(weights[k]) || 0;
          
          const weightModifier = enhancedMetrics?.dynamicWeightModifiers?.[m.num]?.[k] || 0;
          weight *= Math.exp(weightModifier);

          if (weight > 0) {
            const robustZ = getModifiedZScore(val, median, mad);
            // Approximation Logistique Continue de la CDF (sans if/else binaires)
            const squashed = 1.0 / (1.0 + Math.exp(-LOGISTIC_APPROX_FACTOR * robustZ)); 
            const contribution = squashed * weight;
            m.score += contribution;
            if (m.explainability) {
               m.explainability.shapValues[k] = contribution;
            }
          }
        });
      });
    }
  } catch (e) {
    logger.warn({ err: e }, "PCA Denoising échoué, conservation des scores bruts.");
  }

  // Normalisation finale robuste avec le même niveau de confiance
  const allScoresPCA = masterScores.map(m => m.score).sort((a, b) => a - b);
  const alpha = 1.0 - confidenceLevel;
  const pLowIndex = Math.floor(allScoresPCA.length * (alpha / 2.0));  
  const pHighIndex = Math.floor(allScoresPCA.length * (1.0 - (alpha / 2.0)));
  
  const minS = allScoresPCA[pLowIndex] !== undefined ? allScoresPCA[pLowIndex] : allScoresPCA[0];
  const maxS = allScoresPCA[pHighIndex] !== undefined ? allScoresPCA[pHighIndex] : allScoresPCA[allScoresPCA.length - 1];
  const range = Math.max(Number.EPSILON, maxS - minS);

  masterScores.forEach((m) => {
    m.score = Math.max(0, Math.min(100, ((m.score - minS) / range) * 100));
    
    // Normalize SHAP values to represent percentage of the final score contribution
    const totalShap = Object.values(m.explainability?.shapValues || {}).reduce((a, b) => a + b, 0);
    if (totalShap > 0 && m.explainability) {
        Object.keys(m.explainability.shapValues).forEach(k => {
            m.explainability!.shapValues[k] = (m.explainability!.shapValues[k] / totalShap) * m.score;
        });
    }
  });

  return masterScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.num - b.num;
  });
};
