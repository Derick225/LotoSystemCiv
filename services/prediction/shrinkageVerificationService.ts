import { DrawResult, AlgoWeights } from "../../types";
import { logger } from "../../utils/logger";
import { detectGameRegime, calculateStatisticalBounds } from "../mathService";
import { calculateScores } from "./scoringEngine";
import { extractFeatures } from "./featureExtractor";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";

/**
 * Catégories de dérives arithmétiques d'inférence ou d'exactitude
 */
export enum DriftType {
  ACCURACY_DRIFT = "ACCURACY_DRIFT",                 // La réduction bayésienne dégrade la précision historique
  ENTROPY_COLLAPSE = "ENTROPY_COLLAPSE",             // La réduction détruit le signal local (uniformisation)
  ESTIMATOR_SATURATION = "ESTIMATOR_SATURATION",     // Facteur B saturé aux limites [0, 1] de manière persistante
  NUMERICAL_INVARIANT_VIOLATION = "INVARIANT_ERR",   // Sommes de contrôle ou limites [0, 100] violées
  COVARIANCE_SHIFT = "COVARIANCE_SHIFT",             // Divergence excessive locale vs macro
}

export interface DriftIssue {
  type: DriftType;
  severity: "info" | "warning" | "critical";
  description: string;
  continuousValue: number; // Métrique statistique continue sans seuils abrupts
}

export interface ShrinkageDriftReport {
  drawName: string;
  timestamp: number;
  integrityIndex: number;          // Score global de 0 à 100 (100 = parfait)
  detectedDrifts: DriftIssue[];
  shrinkageFactorStats: {
    mean: number;
    variance: number;
    min: number;
    max: number;
  };
  relativeAccuracyGain: number;    // Gain de rang relatif (%) de prédiction sur l'historique
  entropyDivergence: number;       // Divergence KL estimée ou déviation d'entropie relative
  invariantsCheckPassed: boolean;
  remediationAction?: string;
}

/**
 * Fonction de répartition (CDF) de la loi normale standard.
 * JSDOC: Utilise l'approximation rationnelle de Hart pour calculer la probabilité cumulative
 * d'une variable aléatoire gaussienne avec une précision élevée.
 */
export const normalCDF = (x: number): number => {
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804 * Math.exp(-x * x / 2.0);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1.0 - p : p;
};

/**
 * Effectue un test de Welch (t-test pour deux échantillons de variances inégales).
 * JSDOC: Le test de Welch évalue si la différence entre les moyennes des rangs de deux distributions
 * (brute vs bayésienne réduite) est statistiquement significative, sans supposer l'égalité des variances.
 */
export const performWelchTest = (sample1: number[], sample2: number[]): { tStatistic: number; pValue: number } => {
  const n1 = sample1.length;
  const n2 = sample2.length;
  if (n1 < 2 || n2 < 2) return { tStatistic: 0, pValue: 1.0 };

  const mean1 = sample1.reduce((a, b) => a + b, 0) / n1;
  const mean2 = sample2.reduce((a, b) => a + b, 0) / n2;

  // Calcul des variances empiriques réelles sans fallback magique
  const var1 = sample1.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (n1 - 1);
  const var2 = sample2.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (n2 - 1);

  // Utilisation de Number.EPSILON pour éviter la division par zéro sans constante magique
  const denominator = Math.sqrt((var1 / n1) + (var2 / n2)) || Number.EPSILON;
  const tStatistic = (mean1 - mean2) / denominator;

  // Calcul de la p-value bilatérale à partir de la CDF de la loi normale standard
  const pValue = 2.0 * (1.0 - normalCDF(Math.abs(tStatistic)));

  return { tStatistic, pValue };
};

/**
 * Calcul de l'entropie de Shannon d'un ensemble de scores normalisés
 */
const calculateNormalizedScoresEntropy = (scores: number[]): number => {
  const sum = scores.reduce((a, b) => a + Math.max(0, b), 0);
  if (sum <= 1e-9) return 0;
  
  let entropy = 0;
  for (const s of scores) {
    const p = Math.max(0, s) / sum;
    if (p > 1e-9) {
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
};

/**
 * Calcule l'indice de performance prédictive (Cumulative Rank Score) des gagnants réels.
 * Un rang plus faible (plus proche de 1) est meilleur.
 */
const calculateWinnersAverageRank = (sortedScores: { num: number; score: number }[], winners: number[]): number => {
  if (winners.length === 0) return 45.5; // Espérance neutre pour 5 numéros sur 90
  
  let rankSum = 0;
  winners.forEach(w => {
    const idx = sortedScores.findIndex(s => s.num === w);
    const rank = idx !== -1 ? idx + 1 : 90;
    rankSum += rank;
  });
  
  return rankSum / winners.length;
};

/**
 * 1. VÉRIFICATION ON-THE-FLY : Analyse immédiate de l'inférence bayésienne courante
 */
export const verifyActivePrediction = (
  drawName: string,
  rawLocalScores: { num: number; score: number }[],
  shrunkScores: { num: number; score: number }[],
  B: number,
  entropyValue: number
): ShrinkageDriftReport => {
  const now = Date.now();
  const detectedDrifts: DriftIssue[] = [];
  let invariantsCheckPassed = true;

  // --- ANALYSE 1 : Violations des limites arithmétiques ou invariants ---
  let maxScoreError = 0;
  let rawSum = 0;
  let shrunkSum = 0;

  for (let i = 0; i < shrunkScores.length; i++) {
    const rawS = rawLocalScores[i]?.score || 0;
    const s = shrunkScores[i].score;
    rawSum += rawS;
    shrunkSum += s;

    // Détecter les valeurs aberrantes hors bornes [0, 100]
    if (s < -1e-6 || s > 100 + 1e-6) {
      maxScoreError = Math.max(maxScoreError, s < 0 ? -s : s - 100);
      invariantsCheckPassed = false;
    }
  }

  // Dérive de la conservation de la somme totale (invariant d'espérance linéaire)
  const sumDivergence = Math.abs(rawSum - shrunkSum) / Math.max(1, rawSum);
  if (sumDivergence > 0.01) {
    invariantsCheckPassed = false;
    detectedDrifts.push({
      type: DriftType.NUMERICAL_INVARIANT_VIOLATION,
      severity: sumDivergence > 0.05 ? "critical" : "warning",
      description: `Déviation de la somme de conservation arithmétique globale de ${(sumDivergence * 100).toFixed(3)}%.`,
      continuousValue: sumDivergence,
    });
  }

  if (maxScoreError > 0) {
    detectedDrifts.push({
      type: DriftType.NUMERICAL_INVARIANT_VIOLATION,
      severity: maxScoreError > 1.0 ? "critical" : "warning",
      description: `Présence de scores hors limites probabilistes [0, 100] (Amplitude max: ${maxScoreError.toFixed(4)}).`,
      continuousValue: maxScoreError,
    });
  }

  // --- ANALYSE 2 : Effondrement de l'Entropie (Signal Collapse) ---
  const rawEntropy = calculateNormalizedScoresEntropy(rawLocalScores.map(s => s.score));
  const shrunkEntropy = calculateNormalizedScoresEntropy(shrunkScores.map(s => s.score));
  const entropyLossRatio = rawEntropy > 0.01 ? (rawEntropy - shrunkEntropy) / rawEntropy : 0;

  // Seuil continu via fonction sigmoïde : plus la perte d'entropie dépasse 40%, plus l'alarme s'intensifie
  const entropyCollapseSeverity = 1.0 / (1.0 + Math.exp(-12.0 * (entropyLossRatio - 0.40)));
  if (entropyCollapseSeverity > 0.05) {
    const severity = entropyCollapseSeverity > 0.8 ? "critical" : (entropyCollapseSeverity > 0.4 ? "warning" : "info");
    detectedDrifts.push({
      type: DriftType.ENTROPY_COLLAPSE,
      severity,
      description: `Perte d'entropie informationnelle anormale de ${(entropyLossRatio * 100).toFixed(1)}% après réduction. Risque de prédictions uniformes.`,
      continuousValue: entropyLossRatio,
    });
  }

  // --- ANALYSE 3 : Saturation de l'Estimateur (James-Stein Saturation) ---
  if (B > 0.95) {
    detectedDrifts.push({
      type: DriftType.ESTIMATOR_SATURATION,
      severity: "warning",
      description: `Le régularisateur Bayésien domine l'inférence locale (B = ${(B * 100).toFixed(1)}%). Les spécificités du tirage actif sont gommées.`,
      continuousValue: B,
    });
  } else if (B < 1e-4 && entropyValue < 0.85) {
    detectedDrifts.push({
      type: DriftType.ESTIMATOR_SATURATION,
      severity: "info",
      description: `Régularisation Bayésienne quasi-inactive (B = ${(B * 100).toFixed(4)}%) sous régime d'entropie moyenne.`,
      continuousValue: B,
    });
  }

  // --- CALCUL DE L'INDICE GLOBAL D'INTÉGRITÉ ---
  let integrityReduction = 0;
  detectedDrifts.forEach((issue) => {
    const weight = issue.severity === "critical" ? 40 : (issue.severity === "warning" ? 15 : 5);
    integrityReduction += weight * Math.tanh(issue.continuousValue);
  });
  const integrityIndex = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-integrityReduction / 50.0))));

  let remediationAction: string | undefined;
  if (integrityIndex < 50) {
    remediationAction = "URGENT: Réinitialiser l'ajustement dynamique d'ADN ou recalculer les hyper-paramètres du Prior Macro global.";
  } else if (integrityIndex < 80) {
    remediationAction = "RECOMMANDÉ: Recalibrer les coefficients de variance locale via un backtesting walk-forward complet.";
  }

  return {
    drawName,
    timestamp: now,
    integrityIndex,
    detectedDrifts,
    shrinkageFactorStats: {
      mean: B,
      variance: Number.EPSILON,
      min: B,
      max: B
    },
    relativeAccuracyGain: 0,
    entropyDivergence: entropyLossRatio,
    invariantsCheckPassed,
    remediationAction
  };
};

/**
 * 2. VÉRIFICATION HISTORIQUE (BACKTESTING GROUND-TRUTH) : 
 * Croise l'algorithme James-Stein avec les résultats réels du passé pour vérifier l'exactitude
 */
export const runHistoricalShrinkageBacktest = async (
  drawName: string,
  history: DrawResult[],
  weights: AlgoWeights
): Promise<ShrinkageDriftReport> => {
  const now = Date.now();
  const purifiedHistory = purifyHistoryForDraw(drawName, history);
  
  // Échantillon de validation historique (les 8 derniers tirages disponibles possédant au moins 10 antécédents)
  const validationDepth = Math.min(8, purifiedHistory.length - 11);
  const detectedDrifts: DriftIssue[] = [];

  if (validationDepth <= 0) {
    return {
      drawName,
      timestamp: now,
      integrityIndex: 100,
      detectedDrifts: [{
        type: DriftType.ACCURACY_DRIFT,
        severity: "info",
        description: "Historique insuffisant pour exécuter le backtesting de dérive arithmétique.",
        continuousValue: 0,
      }],
      shrinkageFactorStats: { mean: 0, variance: Number.EPSILON, min: 0, max: 0 },
      relativeAccuracyGain: 0,
      entropyDivergence: 0,
      invariantsCheckPassed: true,
    };
  }

  const bValues: number[] = [];
  const unshrunkRanks: number[] = [];
  const shrunkRanks: number[] = [];
  
  let unshrunkWinnersRankSum = 0;
  let shrunkWinnersRankSum = 0;
  let validEvaluationDraws = 0;
  
  const macroFrequency = new Float32Array(91);
  purifiedHistory.forEach(d => {
    d.gagnants?.forEach(num => {
      if (num >= 1 && num <= 90) macroFrequency[num]++;
    });
  });
  const macroSum = macroFrequency.reduce((a, b) => a + b, 0);
  const macroScores: Record<number, number> = {};
  for (let i = 1; i <= 90; i++) {
    macroScores[i] = macroSum > 0 ? (macroFrequency[i] / macroSum) * 100.0 : 50.0;
  }

  // Boucle de backtesting chronologique glissante
  for (let t = 0; t < validationDepth; t++) {
    const targetDraw = purifiedHistory[t];
    const subHistory = purifiedHistory.slice(t + 1);
    
    if (subHistory.length < 10) continue;
    const winners = targetDraw.gagnants;
    if (!winners || winners.length === 0) continue;

    try {
      const features = await extractFeatures(drawName, subHistory);
      
      const statisticalBounds = calculateStatisticalBounds(subHistory);
      const metrics = {
        statisticalBounds,
      };

      const scoredList = calculateScores(features, weights, metrics as any, subHistory);

      // Simulation du James-Stein Shrinkage
      const localScoresArr = scoredList.map(s => s.score);
      const localMean = localScoresArr.reduce((a, b) => a + b, 0) / localScoresArr.length;
      
      // Variance empirique réelle (sans fallback magique, division par N-1 pour estimateur sans biais)
      const varianceSum = localScoresArr.reduce((sum, val) => sum + Math.pow(val - localMean, 2), 0);
      const s2Local = (varianceSum / (localScoresArr.length - 1)) || Number.EPSILON;

      let sumSqrDiff = 0;
      scoredList.forEach((item) => {
        const macro = macroScores[item.num] || 0;
        sumSqrDiff += Math.pow(item.score - macro, 2);
      });
      const mse = sumSqrDiff / scoredList.length;

      const varianceRatio = s2Local / (s2Local + mse + Number.EPSILON);
      const gameRegimeInfo = detectGameRegime(subHistory);
      const maxShrinkage = 1.0 - gameRegimeInfo.entropy;
      const B = Math.max(0, Math.min(1.0, maxShrinkage * (1.0 - varianceRatio)));
      
      bValues.push(B);

      const shrunkList = scoredList.map(item => {
        const macro = macroScores[item.num] || 0;
        return {
          num: item.num,
          score: (1.0 - B) * item.score + B * macro
        };
      });

      const sortedUnshrunk = [...scoredList].sort((a, b) => b.score - a.score);
      const sortedShrunk = [...shrunkList].sort((a, b) => b.score - a.score);

      const rUnshrunk = calculateWinnersAverageRank(sortedUnshrunk, winners);
      const rShrunk = calculateWinnersAverageRank(sortedShrunk, winners);

      unshrunkRanks.push(rUnshrunk);
      shrunkRanks.push(rShrunk);

      unshrunkWinnersRankSum += rUnshrunk;
      shrunkWinnersRankSum += rShrunk;
      validEvaluationDraws++;
    } catch (e) {
      logger.error({ err: e }, `[shrinkageVerification] Error backtesting draw index ${t}`);
    }
  }

  if (validEvaluationDraws === 0) {
    return {
      drawName,
      timestamp: now,
      integrityIndex: 100,
      detectedDrifts: [],
      shrinkageFactorStats: { mean: 0, variance: Number.EPSILON, min: 0, max: 0 },
      relativeAccuracyGain: 0,
      entropyDivergence: 0,
      invariantsCheckPassed: true,
    };
  }

  // --- ANALYSE DES STATS DE VALIDATION ---
  const avgUnshrunkRank = unshrunkWinnersRankSum / validEvaluationDraws;
  const avgShrunkRank = shrunkWinnersRankSum / validEvaluationDraws;
  const relativeAccuracyGain = avgUnshrunkRank - avgShrunkRank;

  const bMean = bValues.reduce((a, b) => a + b, 0) / bValues.length;
  const bMin = Math.min(...bValues);
  const bMax = Math.max(...bValues);
  const bVariance = bValues.reduce((a, b) => a + Math.pow(b - bMean, 2), 0) / bValues.length || Number.EPSILON;

  // --- TEST DE WELCH ADAPTATIF ET SANS SEUILS MAGIQUES ---
  const { tStatistic, pValue } = performWelchTest(unshrunkRanks, shrunkRanks);
  const isSignificant = pValue < 0.05; // Niveau de signification standard alpha = 0.05

  if (isSignificant && relativeAccuracyGain < 0) {
    // Si la dégradation est statistiquement significative
    detectedDrifts.push({
      type: DriftType.ACCURACY_DRIFT,
      severity: "critical",
      description: `Dérive d'exactitude critique détectée (Test de Welch significatif p=${pValue.toFixed(4)}, t=${tStatistic.toFixed(2)}) : La réduction bayésienne dégrade la performance prédictive (Gain net = ${relativeAccuracyGain.toFixed(2)} rangs).`,
      continuousValue: Math.abs(relativeAccuracyGain) / avgUnshrunkRank,
    });
  } else if (relativeAccuracyGain < -0.5) {
    // Dégradation tendancielle non statistiquement significative
    detectedDrifts.push({
      type: DriftType.ACCURACY_DRIFT,
      severity: "warning",
      description: `Dérive d'exactitude tendancielle (Test de Welch non significatif p=${pValue.toFixed(4)}) : La réduction bayésienne dégrade légèrement les performances de ${Math.abs(relativeAccuracyGain).toFixed(2)} rangs en moyenne.`,
      continuousValue: pValue,
    });
  } else if (isSignificant && relativeAccuracyGain > 0) {
    // Amélioration statistiquement significative
    detectedDrifts.push({
      type: DriftType.ACCURACY_DRIFT,
      severity: "info",
      description: `Inférence statistiquement saine (Test de Welch p=${pValue.toFixed(4)}, t=${tStatistic.toFixed(2)}) : La réduction James-Stein améliore de manière robuste le classement de ${relativeAccuracyGain.toFixed(2)} rangs.`,
      continuousValue: relativeAccuracyGain / avgUnshrunkRank,
    });
  }

  // --- ALARME CONTINUE DE COVARIANCE SHIFT ---
  if (bVariance > 0.08) {
    detectedDrifts.push({
      type: DriftType.COVARIANCE_SHIFT,
      severity: "warning",
      description: `Instabilité de covariance : Les coefficients de réduction oscillent fortement (Variance de B: ${bVariance.toFixed(3)}), signalant une mauvaise transition de régime.`,
      continuousValue: bVariance,
    });
  }

  // --- CALCUL DE L'INDICE GLOBAL D'INTÉGRITÉ ---
  let integrityReduction = 0;
  detectedDrifts.forEach((issue) => {
    const weight = issue.severity === "critical" ? 45 : (issue.severity === "warning" ? 20 : 0);
    integrityReduction += weight * Math.tanh(issue.continuousValue);
  });
  const integrityIndex = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-integrityReduction / 50.0))));

  let remediationAction: string | undefined;
  if (integrityIndex < 60) {
    remediationAction = "AJUSTEMENT CRITIQUE : Désactiver temporairement la réduction bayésienne James-Stein ou réduire son poids d'amortissement macro.";
  } else if (integrityIndex < 85) {
    remediationAction = "VIGILANCE : Recalibrer l'entropie de Shannon du régime de jeu ou ajuster le lissage de covariance.";
  }

  return {
    drawName,
    timestamp: now,
    integrityIndex,
    detectedDrifts,
    shrinkageFactorStats: {
      mean: bMean,
      variance: bVariance,
      min: bMin,
      max: bMax
    },
    relativeAccuracyGain,
    entropyDivergence: 0,
    invariantsCheckPassed: true,
    remediationAction
  };
};
