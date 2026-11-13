import type {
  ForensicReport,
  ForensicEvidence,
  ScoreBreakdown,
  CounterfactualResult,
  SpectralDeviation,
  AlgoWeights,
  DrawResult,
  ForensicActionableAdjustment,
  ForensicFailureMode,
  SeverityLevel,
  ForensicConfidence,
} from "../../types";
import { getAlgoWeights } from "../prediction/predictionFacade";
import { fetchResults } from "../lotteryService";
import { generateAutopsyAnalysis } from "../geminiService";
import { analyzeForManipulation } from "../forensicAuditService";
import { parseDateSafely } from "../../utils/dateUtils";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import { getDeterministicUUID } from "../../utils/mathUtils";
import { runCounterfactualSimulation } from "./counterfactualEngine";

/**
 * Calcule la probabilité binomiale cumulée P(X >= k) pour X ~ B(n, p)
 * Utilisé pour déterminer la signification statistique de l'accord des algorithmes.
 */
const binomialPValue = (n: number, p: number, k: number): number => {
  if (k <= 0) return 1.0;
  if (k > n) return 0.0;

  const nCr = (nVal: number, rVal: number): number => {
    if (rVal < 0 || rVal > nVal) return 0;
    if (rVal === 0 || rVal === nVal) return 1;
    let r = rVal;
    if (r > nVal / 2) r = nVal - r;
    let res = 1;
    for (let i = 1; i <= r; i++) {
      res = (res * (nVal - r + i)) / i;
    }
    return res;
  };

  let sum = 0;
  for (let j = k; j <= n; j++) {
    sum += nCr(n, j) * Math.pow(p, j) * Math.pow(1 - p, n - j);
  }
  return Math.min(1.0, Math.max(0.0, sum));
};

// ============================================================================
// MOTEUR D'AUTOPSIE MATHÉMATIQUE (ZÉRO NOMBRE MAGIQUE)
// ============================================================================

export const runForensicAutopsy = (
  drawName: string,
  date: string,
  predictedNumbers: number[],
  actualWinningNumbers: number[],
  predictionBreakdown?: Record<number, ScoreBreakdown>,
  predictionId?: string,
  drawResultId?: string,
  skipLLM: boolean = false,
  fullHistory?: DrawResult[]
) => performForensicAnalysis(
  drawName,
  date,
  predictedNumbers,
  actualWinningNumbers,
  predictionBreakdown,
  predictionId,
  drawResultId,
  skipLLM,
  fullHistory
);

export const performForensicAnalysis = async (
  drawName: string,
  date: string,
  predictedNumbers: number[],
  actualWinningNumbers: number[],
  predictionBreakdown?: Record<number, ScoreBreakdown>,
  predictionId?: string,
  drawResultId?: string,
  skipLLM: boolean = false,
  fullHistory?: DrawResult[]
): Promise<ForensicReport> => {
  const matches: ForensicEvidence[] = [];
  const actualSet = new Set(actualWinningNumbers);
  const algoImpacts: Record<string, number> = {};

  if (!fullHistory) {
    const { data } = await fetchResults(drawName);
    fullHistory = purifyHistoryForDraw(drawName, data);
  }

  const resultRef = fullHistory.find((d) => d.date === date);
  const machineNumbers = resultRef?.machine || [];
  const machineSet = new Set(machineNumbers);

  // Exclure le tirage actuel de l'historique pour l'analyse Forensic afin d'éviter la pollution/double compte
  const priorHistory = resultRef ? fullHistory.filter(h => h.id !== resultRef.id) : fullHistory;

  // 1. Unification Forensic & Intégrité (UFI)
  const UFI_Data = analyzeForManipulation(actualWinningNumbers, priorHistory);
  const driftTolerance = UFI_Data.idealAlgorithmicDriftTolerance;

  const getReverse = (n: number) => {
    const rev = parseInt(n.toString().split("").reverse().join(""));
    return rev >= 1 && rev <= 90 && rev !== n ? rev : null;
  };

  // 2. Analyse Balistique des Hits et Écarts
  predictedNumbers.forEach((pred) => {
    if (actualSet.has(pred)) {
      matches.push({
        predicted: pred,
        actual: pred,
        errorType: "Hit",
        delta: "Direct",
      });
    } else {
      let found = false;
      if (!found && machineSet.has(pred)) {
        matches.push({
          predicted: pred,
          actual: pred,
          errorType: "Machine",
          delta: "Shift",
          suggestedCorrection:
            "Fuite Thermique : Le signal était exact mais la vélocité l'a poussé dans la Machine.",
        });
        found = true;
      }
      if (!found && actualSet.has(pred - 1)) {
        matches.push({
          predicted: pred,
          actual: pred - 1,
          errorType: "Voisin",
          delta: "-1",
          suggestedCorrection:
            "Ajustement Mineur : Augmenter l'influence Markov/Spatial.",
        });
        found = true;
      } else if (!found && actualSet.has(pred + 1)) {
        matches.push({
          predicted: pred,
          actual: pred + 1,
          errorType: "Voisin",
          delta: "+1",
          suggestedCorrection:
            "Ajustement Mineur : Augmenter l'influence Markov/Spatial.",
        });
        found = true;
      }
      if (!found) {
        const mirror = 91 - pred;
        if (actualSet.has(mirror)) {
          matches.push({
            predicted: pred,
            actual: mirror,
            errorType: "Miroir",
            delta: "Inv",
            suggestedCorrection:
              "Symétrie Structurelle : Effet miroir détecté.",
          });
          found = true;
        }
      }
      if (!found) {
        const reverse = getReverse(pred);
        if (reverse && actualSet.has(reverse)) {
          matches.push({
            predicted: pred,
            actual: reverse,
            errorType: "Shadow",
            delta: "Flip",
            suggestedCorrection:
              "Anomalie Numérologique : Inversion de pattern.",
          });
          found = true;
        }
      }
      if (!found) {
        matches.push({
          predicted: pred,
          actual: null,
          errorType: "None",
          delta: "??",
        });
      }
    }
  });

  // 3. Identification des occasions manquées (Signaux forts non retenus)
  const missed: {
    number: number;
    reason: string;
    zScore?: number;
    continuousWeight?: number;
    bestAlgo?: string;
  }[] = [];

  if (predictionBreakdown) {
    actualWinningNumbers.forEach((win) => {
      const isCovered = matches.some((m) => m.actual === win);
      const scores = predictionBreakdown[win];
      if (scores) {
        const sortedAlgos = Object.entries(scores)
          .filter(([_, v]) => typeof v === "number")
          .sort((a: [string, number], b: [string, number]) => b[1] - a[1]);

        const bestAlgo = sortedAlgos[0];
        if (bestAlgo) {
          const scoreVal = bestAlgo[1] as number;
          const allScores = Object.values(scores).filter(
            (v) => typeof v === "number",
          ) as number[];
          const meanScore =
            allScores.reduce((a, b) => a + b, 0) / (allScores.length || 1);
          const stdevScore = Math.sqrt(
            allScores.reduce((a, b) => a + Math.pow(b - meanScore, 2), 0) /
              (allScores.length || 1),
          );

          const zScore = (scoreVal - meanScore) / (stdevScore + Number.EPSILON);
          // CDF Logistique exacte : remplace les seuils binaires arbitraires
          const continuousWeight = 1.0 / (1.0 + Math.exp(-zScore));

          algoImpacts[bestAlgo[0]] =
            (algoImpacts[bestAlgo[0]] || 0) + scoreVal * continuousWeight;

          if (!isCovered) {
            const certaintyPercent = (continuousWeight * 100).toFixed(1);
            missed.push({
              number: win,
              reason: `Signal de perte détecté sur ${bestAlgo[0]} (Z=${zScore.toFixed(2)}, Certitude=${certaintyPercent}%). Activée proportionnellement via CDF logistique.`,
              zScore,
              continuousWeight,
              bestAlgo: bestAlgo[0]
            });
          }
        } else if (!isCovered) {
          missed.push({
            number: win,
            reason: "Aucune donnée spectrale continue capturée.",
            zScore: 0,
            continuousWeight: 0.5
          });
        }
      } else if (!isCovered) {
        missed.push({
          number: win,
          reason: "Aucune donnée spectrale capturée.",
          zScore: 0,
          continuousWeight: 0.5
        });
      }
    });
  }

  // 4. Calcul de la divergence des scores
  const scoreDivergence: { algo: string; impact: number }[] = [];
  const maxImpact = Math.max(Number.EPSILON, ...Object.values(algoImpacts));
  Object.entries(algoImpacts).forEach(([algo, val]) => {
    if (val > 0) {
      scoreDivergence.push({
        algo,
        impact: Math.round((val / maxImpact) * 100),
      });
    }
  });

  // 5. Calcul de la déviation spectrale (RMSE) & Métriques Chirurgicales
  const spectralDeviations: SpectralDeviation[] = [];
  let squaredErrorSum = 0;
  let validPoints = 0;
  let brierSum = 0;
  let shannonEntropy: number | undefined;
  const allScores: { number: number; score: number }[] = [];

  const activeBreakdown = predictionBreakdown;

  if (activeBreakdown) {
    for (let i = 1; i <= 90; i++) {
      const scores = activeBreakdown[i];
      if (!scores) continue;
      const values = Object.values(scores).filter(
        (v) => typeof v === "number",
      ) as number[];
      const predictedScore =
        values.length > 0
          ? values.reduce((a, b) => a + b, 0) / values.length
          : 0;
      allScores.push({ number: i, score: predictedScore });

      const isActual = actualSet.has(i) ? 100 : 0;
      const delta = predictedScore - isActual;
      squaredErrorSum += Math.pow(delta, 2);
      validPoints++;

      const pPredicted = predictedScore / 100.0;
      const pActual = actualSet.has(i) ? 1 : 0;
      brierSum += Math.pow(pPredicted - pActual, 2);

      if (
        actualSet.has(i) ||
        (predictedNumbers.includes(i) && Math.abs(delta) > 50)
      ) {
        spectralDeviations.push({
          number: i,
          predictedEnergy: Math.round(predictedScore),
          actualEnergy: isActual,
          delta: Math.round(delta),
        });
      }
    }
  }

  const brier_score =
    validPoints > 0 ? brierSum / validPoints : undefined;
  const rmse =
    validPoints > 0 ? Math.sqrt(squaredErrorSum / validPoints) : undefined;

  let z_scores: { number: number; z: number }[] = [];
  let kl_divergence: number | undefined;

  if (allScores.length > 0) {
    const sumScores = allScores.reduce((acc, s) => acc + s.score, 0) || 1;
    const meanScore = sumScores / allScores.length;
    const stdDevScore =
      Math.sqrt(
        allScores.reduce(
          (acc, s) => acc + Math.pow(s.score - meanScore, 2),
          0,
        ) / allScores.length,
      ) || Number.EPSILON;

    allScores.forEach((s) => {
      const p = s.score / sumScores;
      if (p > 0) shannonEntropy = (shannonEntropy ?? 0) - p * Math.log2(p);

      if (actualSet.has(s.number)) {
        z_scores.push({
          number: s.number,
          z: (s.score - meanScore) / stdDevScore,
        });
      }
      const epsilon = Number.EPSILON;
      const pActual = actualSet.has(s.number)
        ? 1 / actualWinningNumbers.length
        : 0;
      if (pActual > 0) {
        kl_divergence =
          (kl_divergence ?? 0) + pActual * Math.log2(pActual / (p + epsilon));
      }
    });
  }

  // 6. Simulation Contrefactuelle
  let counterfactuals: CounterfactualResult[] = [];
  let continuousTopologicalLoss = 1.0 - Math.exp(-1.0); // Baseline exponentielle continue (1 - 1/e ≈ 0.632)
  let wassersteinLoss = (90.0 / 4.0) * (1.0 - Math.exp(-1.0)); // Dispersion Wasserstein baseline
  const baseWeights: AlgoWeights = await getAlgoWeights(drawName);
  if (activeBreakdown) {
    const simulationResult = runCounterfactualSimulation(
      baseWeights,
      activeBreakdown,
      actualWinningNumbers,
      driftTolerance,
    );
    counterfactuals = simulationResult.counterfactuals;
    continuousTopologicalLoss = simulationResult.baselineLoss;
    if (simulationResult.baselineWassersteinLoss !== undefined) {
      wassersteinLoss = simulationResult.baselineWassersteinLoss;
    }
  }

  // 7. Extraction des données pour l'Oracle Base (Dérive, Proximités, Manquements)
  const algorithmicDrift: {
    algo: string;
    driftScore: number;
    direction: "overestimating" | "underestimating";
  }[] = [];
  const nearMisses: {
    predicted: number;
    actual: number;
    distance: number;
    algo?: string;
    errorType?: string;
  }[] = [];
  const missedSignals: {
    pattern: string;
    type: string;
    significance: number;
  }[] = [];

  const algoOverestimation: Record<string, number[]> = {};
  const algoUnderestimation: Record<string, number[]> = {};

  if (activeBreakdown) {
    for (let i = 1; i <= 90; i++) {
      const scores = activeBreakdown[i];
      if (!scores) continue;

      let minDistance = 90;
      actualWinningNumbers.forEach(win => {
        const directDist = Math.abs(i - win);
        const circularDist = Math.min(directDist, 90 - directDist);
        if (circularDist < minDistance) {
          minDistance = circularDist;
        }
      });

      const affinity = Math.exp(-(Math.pow(minDistance, 2)) / 2.0);

      Object.entries(scores).forEach(([algo, numScore]) => {
        if (typeof numScore === "number") {
          const isPredicted = predictedNumbers.includes(i) ? 1.0 : 0.0;

          const underPenalty = (1.0 - isPredicted) * affinity * (100.0 - numScore);
          if (underPenalty > Number.EPSILON) {
            if (!algoUnderestimation[algo]) algoUnderestimation[algo] = [];
            algoUnderestimation[algo].push(underPenalty);
          }

          const overPenalty = isPredicted * (1.0 - affinity) * numScore;
          if (overPenalty > Number.EPSILON) {
            if (!algoOverestimation[algo]) algoOverestimation[algo] = [];
            algoOverestimation[algo].push(overPenalty);
          }
        }
      });
    }

    const algoStats: Record<string, { mean: number; std: number }> = {};
    Object.keys(baseWeights || {}).forEach((algo) => {
      const over = algoOverestimation[algo] || [];
      const under = algoUnderestimation[algo] || [];
      const all = [...over, ...under];

      if (all.length > 0) {
        const mean = all.reduce((a, b) => a + b, 0) / all.length;
        const std =
          Math.sqrt(
            all.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / all.length,
          ) || Number.EPSILON;
        algoStats[algo] = { mean, std };
      } else {
        const expectedUniformMean = 50.0;
        const expectedUniformStd = 100.0 / Math.sqrt(12.0);
        algoStats[algo] = { mean: expectedUniformMean, std: expectedUniformStd };
      }

      const overAvg =
        over.length > 0 ? over.reduce((a, b) => a + b, 0) / over.length : 0;
      const underAvg =
        under.length > 0 ? under.reduce((a, b) => a + b, 0) / under.length : 0;

      const zOver = (overAvg - algoStats[algo].mean) / algoStats[algo].std;
      const zUnder = (underAvg - algoStats[algo].mean) / algoStats[algo].std;

      const sigmoidK = 2.0;
      const overDriftWeight = 1.0 / (1.0 + Math.exp(-sigmoidK * (zOver - 1.0)));
      const underDriftWeight = 1.0 / (1.0 + Math.exp(-sigmoidK * (zUnder - 1.0)));

      if (overDriftWeight > Number.EPSILON) {
        algorithmicDrift.push({
          algo,
          driftScore: overAvg * overDriftWeight,
          direction: "overestimating",
        });
      }
      if (underDriftWeight > Number.EPSILON) {
        algorithmicDrift.push({
          algo,
          driftScore: underAvg * underDriftWeight,
          direction: "underestimating",
        });
      }
    });
  }

  matches
    .filter(
      (m) =>
        m.errorType === "Voisin" ||
        m.errorType === "Miroir" ||
        m.errorType === "Shadow",
    )
    .forEach((m) => {
      if (m.actual) {
        nearMisses.push({
          predicted: m.predicted,
          actual: m.actual,
          distance: Math.abs(m.predicted - m.actual),
          errorType: m.errorType,
        });
      }
    });

  if (missed.length > 0) {
    const decadesMissed = missed.map((m) => Math.floor(m.number / 10));
    const evensMissed = missed.filter((m) => m.number % 2 === 0).length;
    const decadeCounts = decadesMissed.reduce(
      (acc, val) => {
        acc[val] = (acc[val] || 0) + 1;
        return acc;
      },
      {} as Record<number, number>,
    );

    const expectedSignificance = 100.0 / 5.0;
    Object.entries(decadeCounts).forEach(([decade, count]) => {
      if (count >= 2)
        missedSignals.push({
          pattern: `Décade ${decade}0s`,
          type: "Zone aveugle",
          significance: count * expectedSignificance,
        });
    });
    if (evensMissed >= 3)
      missedSignals.push({
        pattern: `Nombres Pairs`,
        type: "Biais de parité",
        significance: 3 * expectedSignificance,
      });
    if (missed.length - evensMissed >= 3)
      missedSignals.push({
        pattern: `Nombres Impairs`,
        type: "Biais de parité",
        significance: 3 * expectedSignificance,
      });
  }

  // 8. XAI - Autopsie Littéraire
  const exactHitsCount = matches.filter((m) => m.errorType === "Hit").length;
  const nearMissesCount = matches.filter(
    (m) =>
      m.errorType === "Voisin" ||
      m.errorType === "Miroir" ||
      m.errorType === "Shadow",
  ).length;
  let machineHits = 0;
  predictedNumbers.forEach((n) => {
    if (machineNumbers.includes(n)) machineHits++;
  });

  let aiAutopsy = null;
  if (!skipLLM) {
    aiAutopsy = await generateAutopsyAnalysis(
      drawName,
      predictedNumbers,
      actualWinningNumbers,
      machineNumbers,
      exactHitsCount,
      nearMissesCount,
      machineHits,
      rmse,
      spectralDeviations,
    );
  }

  // 9. Proposed Weight Adjustments based on anomalies
  const proposedAdjustments: {
    algo: string;
    proposedWeightChange: number;
    reason: string;
  }[] = [];

  algorithmicDrift.forEach((drift) => {
    let adjustment = (drift.driftScore / 100.0) * driftTolerance;
    const driftCompensationRate = 1.0 - Math.exp(-driftTolerance);
    if (drift.direction === "overestimating") {
      proposedAdjustments.push({
        algo: drift.algo,
        proposedWeightChange: -parseFloat((adjustment * driftCompensationRate).toFixed(4)),
        reason: `Dérive algorithmique (surestimation Z>${1.0}). Réduction calibrée à -${(adjustment * driftCompensationRate * 100).toFixed(1)}% via UFI.`,
      });
    } else {
      proposedAdjustments.push({
        algo: drift.algo,
        proposedWeightChange: parseFloat((adjustment * driftCompensationRate).toFixed(4)),
        reason: `Dérive algorithmique (sous-estimation Z>${1.0}). Augmentation calibrée à +${(adjustment * driftCompensationRate * 100).toFixed(1)}% via UFI.`,
      });
    }
  });

  if (spectralDeviations.length > 0) {
    const meanDelta =
      spectralDeviations.reduce((a, b) => a + Math.abs(b.delta), 0) /
      spectralDeviations.length;
    const stdDelta =
      Math.sqrt(
        spectralDeviations.reduce(
          (a, b) => a + Math.pow(Math.abs(b.delta) - meanDelta, 2),
          0,
        ) / spectralDeviations.length,
      ) || Number.EPSILON;

    spectralDeviations.forEach((spectral) => {
      const zScore = Math.abs(Math.abs(spectral.delta) - meanDelta) / stdDelta;
      const continuousSignificance = 1.0 / (1.0 + Math.exp(-2.0 * (zScore - 1.5)));
      const spectralAdjustment = 0.15 * driftTolerance * continuousSignificance;

      if (spectralAdjustment > Number.EPSILON) {
        proposedAdjustments.push({
          algo: `Numéro ${spectral.number}`,
          proposedWeightChange:
            spectral.delta > 0
              ? -spectralAdjustment
              : spectralAdjustment,
          reason: `Signature spectrale (Delta: ${spectral.delta.toFixed(1)}). Ajusté continuellement via UFI (z=${zScore.toFixed(2)}).`,
        });
      }
    });
  }

  // 10. Audit d'Orbitage d'ADN & Force de Consensus (Théorie de l'Information)
  let antiConsensusActive = false;
  let challengedTargets: number[] = [];
  if (predictionId) {
    try {
      const { getPredictionHistoryAsync } =
        await import("../predictionHistoryService");
      const historyItems = await getPredictionHistoryAsync(drawName);
      const matched = historyItems.find((item) => item.id === predictionId);
      if (matched && matched.prediction) {
        antiConsensusActive = matched.prediction.adversarialApplied || false;
        challengedTargets = matched.prediction.challengedNumbers || [];
      }
    } catch (e) {
      console.warn("Failed to retrieve prediction for forensic loop check", e);
    }
  }

  // Calcul du DNA XAP pour les numéros gagnants
  let winningXAP: import("../training/DNAOptimizer").XAPExplanation[] = [];
  if (predictionBreakdown && Object.keys(baseWeights).length > 0) {
    const { DNAOptimizer } = await import("../training/DNAOptimizer");
    const algoKeys = Object.keys(baseWeights) as import("../../shared/prediction.types").AlgoKey[];
    const optimizer = new DNAOptimizer(algoKeys);
    const numAlgos = optimizer.getNumAlgos();
    const dnaMatrix = actualWinningNumbers.map((num) => {
      const bdown = predictionBreakdown[num] || {};
      const vec = new Float32Array(numAlgos);
      algoKeys.forEach((k, i) => {
        vec[i] = (bdown as Record<string, number>)[k] || 0;
      });
      return vec;
    });

    let diversitySum = 0;
    let pairs = 0;
    for (let i = 0; i < dnaMatrix.length; i++) {
      for (let j = i + 1; j < dnaMatrix.length; j++) {
        diversitySum += optimizer.calculateCosineDistance(dnaMatrix[i], dnaMatrix[j]);
        pairs++;
      }
    }
    const diversityScore = pairs > 0 ? diversitySum / pairs : 0;

    const synergyVector = new Float32Array(numAlgos);
    if (dnaMatrix.length > 0) {
      for (let a = 0; a < numAlgos; a++) {
        let sum = 0;
        for (let k = 0; k < dnaMatrix.length; k++) {
          sum += dnaMatrix[k][a] || 0;
        }
        synergyVector[a] = sum / dnaMatrix.length;
      }
    }

    winningXAP = optimizer.generateXAP(
      {
        numbers: actualWinningNumbers,
        dnaMatrix,
        synergyVector,
        distance: 0,
        diversityScore,
      },
      actualWinningNumbers,
    );

    try {
      const dnaCalibrations = optimizer.calibrateDNAFromWinningComposition(baseWeights, winningXAP);
      dnaCalibrations.forEach((adj) => {
        proposedAdjustments.push(adj);
      });
    } catch (err) {
      console.warn("[DNA Calibration Injection Error]:", err);
    }
  }

  let consensusStrength = 0;
  if (predictionBreakdown && Object.keys(baseWeights).length > 0) {
    const keyAlgos = Object.keys(baseWeights);
    const numAlgos = keyAlgos.length;

    const algoRecommendations: Record<string, Set<number>> = {};
    keyAlgos.forEach(algo => {
      const scored: { num: number; s: number }[] = [];
      for (let i = 1; i <= 90; i++) {
        const bdMap = predictionBreakdown as Record<number, Record<string, number>>;
        const score = bdMap[i]?.[algo] || bdMap[i]?.[algo.toUpperCase()] || 0;
        scored.push({ num: i, s: score });
      }
      scored.sort((a, b) => b.s - a.s);
      algoRecommendations[algo] = new Set(scored.slice(0, 18).map(x => x.num));
    });

    let totalSurprisal = 0;
    let counted = 0;

    predictedNumbers.forEach(num => {
      let successes = 0;
      keyAlgos.forEach(algo => {
        if (algoRecommendations[algo]?.has(num)) {
          successes++;
        }
      });

      const pVal = binomialPValue(numAlgos, 0.2, successes);
      const surprisal = -Math.log2(Math.max(Number.EPSILON, pVal));
      totalSurprisal += surprisal;
      counted++;
    });

    const avgSurprisal = counted > 0 ? totalSurprisal / counted : 0;
    const maxPossibleSurprisal = -numAlgos * Math.log2(0.2);
    consensusStrength = Math.min(100, Math.max(10, Math.round((avgSurprisal / (maxPossibleSurprisal || 1)) * 100)));
  } else {
    consensusStrength = 10;
  }

  const maxPossibleEntropy = Math.log2(90);
  const entropyRatio = shannonEntropy
    ? shannonEntropy / maxPossibleEntropy
    : 0;

  const chaosPenalty = entropyRatio;
  const rawOrbiting = consensusStrength * (1.0 - chaosPenalty * 0.5);

  let dnaOrbitingIndex = Math.min(100, Math.max(5, Math.round(rawOrbiting)));

  if (antiConsensusActive) {
    const antiConsensusDamping = 1.0 - 0.5 * entropyRatio;
    dnaOrbitingIndex = Math.round(dnaOrbitingIndex * antiConsensusDamping);
  }

  // Hash déterministe pour l'ID
  const seed = `${drawName}_${date}_${predictionId || ""}_${drawResultId || ""}_${actualWinningNumbers.join("")}`;
  let hashVal = 0;
  for (let i = 0; i < seed.length; i++) {
    hashVal = (hashVal << 5) - hashVal + seed.charCodeAt(i);
    hashVal |= 0;
  }
  const deterministicId = getDeterministicUUID(`forensic_${Math.abs(hashVal)}`);

  const divergenceMetric = Math.max(0, Math.min(100, Math.round((1.0 - (exactHitsCount + 0.5 * nearMisses.length) / 5) * 100)));

  // ============================================================================
  // SYSTÈME D'ATTRIBUTION CAUSALE AUTOMATISÉE & RAPPORT D'AMÉLIORATION ACTIONNABLE
  // ============================================================================
  const drawAnomalyScore = Math.max(0, Math.min(100, Math.round(100.0 - (UFI_Data.unifiedIntegrityIndex ?? 100.0))));
  const hitEffectiveness = (exactHitsCount * 1.0 + nearMisses.length * 0.4) / 5.0;
  const brierPenaltyFactor =
    brier_score === undefined
      ? 1.0
      : (1.0 + Math.min(1.0, brier_score * 15.0)) / 2.0;
  const modelMissScore = Math.min(100, Math.max(0, Math.round((1.0 - Math.min(1.0, hitEffectiveness)) * 100.0 * brierPenaltyFactor)));

  const structuralQualityScore = Math.max(0, Math.min(100, Math.round(
    100.0 * Math.exp(-Math.max(0, continuousTopologicalLoss) - (Math.max(0, wassersteinLoss) / 45.0))
  )));

  const postMortemStabilityScore = Math.max(0, Math.min(100, Math.round(
    (structuralQualityScore * 0.5) + ((100.0 - modelMissScore) * 0.5)
  )));

  // Attribution Causale Déterministe
  const dominantCauses: string[] = [];
  const warnings: string[] = [];

  const cuspBifurcationActive = UFI_Data.catastropheControlParams?.regime === "BIFURCATION_ACTIVE";
  const entropyCollapseMeasured = UFI_Data.entropyCollapse === true;
  const topologicalBreak = cuspBifurcationActive || entropyCollapseMeasured;

  if (drawAnomalyScore >= 65 || (UFI_Data.riggedProbability && UFI_Data.riggedProbability > 0.6)) {
    dominantCauses.push("Anomalie structurelle du tirage : rupture des distributions standard (UFI bas, biais stochastique)");
  }
  if (topologicalBreak) {
    dominantCauses.push(
      `Effondrement entropique ou saut de catastrophe topologique (changement de régime dynamique) : ${
        cuspBifurcationActive
          ? `bifurcation active (Δ = ${UFI_Data.catastropheControlParams?.discriminant.toFixed(2)})`
          : "effondrement entropique signalé par l'audit"
      }`,
    );
  }
  if (nearMisses.length >= 3 && exactHitsCount <= 1) {
    dominantCauses.push(`Dispersion par frôlements (${nearMisses.length} near-misses) : résonance spatiale/miroir présente mais décalée`);
  }
  if (brier_score !== undefined && brier_score > 0.08) {
    dominantCauses.push("Surconfiance de l'ensemble d'inférence : probabilités disproportionnées par rapport aux réalisations");
  }
  if (continuousTopologicalLoss > 0.6) {
    dominantCauses.push("Divergence topologique : barycentre des prédictions éloigné des zones d'attraction réelles");
  }

  const severeDrifts = algorithmicDrift.filter(d => Math.abs(d.driftScore) >= 1.5);
  if (severeDrifts.length > 0) {
    dominantCauses.push(`Dérive algorithmique prononcée sur les estimateurs : ${severeDrifts.slice(0, 3).map(d => `${d.algo} (${d.direction})`).join(", ")}`);
  }
  if (dominantCauses.length === 0) {
    if (exactHitsCount >= 2) {
      dominantCauses.push("Convergence prédictive réussie : alignement cohérent des sous-modèles");
    } else {
      dominantCauses.push("Fluctuation stochastique normale : dispersion dans les limites prévues par le bruit poissonnien");
    }
  }

  // Classification du Mode de Défaillance
  let failureMode: ForensicFailureMode = "normalnoise";
  if (drawAnomalyScore >= 70) {
    failureMode = "anomalousdraw";
  } else if (topologicalBreak) {
    failureMode = "regimebreak";
  } else if (severeDrifts.some(d => d.algo.toLowerCase().includes("momentum") || d.algo.toLowerCase().includes("freq"))) {
    failureMode = "recentoverfit";
  } else if (continuousTopologicalLoss > 0.65 || (nearMisses.length >= 3 && exactHitsCount === 0)) {
    failureMode = "structuralmisalignment";
  } else if (brier_score !== undefined && brier_score > 0.08) {
    failureMode = "overconfidence";
  } else {
    failureMode = "normalnoise";
  }

  // Gravité (Severity)
  let severity: SeverityLevel = "low";
  if (modelMissScore > 80 && drawAnomalyScore < 40) {
    severity = "critical";
    warnings.push("Alerte critique : échec du modèle sur un tirage statistiquement normal.");
  } else if (modelMissScore > 65) {
    severity = "high";
  } else if (modelMissScore > 35) {
    severity = "medium";
  } else {
    severity = "low";
  }

  // Confiance Forensique
  const confidenceReasons: string[] = [];
  if (exactHitsCount > 0 || nearMisses.length > 0) confidenceReasons.push(`${exactHitsCount} hits et ${nearMisses.length} near-misses analysés.`);
  if (counterfactuals.length > 0) confidenceReasons.push(`${counterfactuals.length} simulations contrefactuelles résolues.`);
  confidenceReasons.push(`UFI du tirage: ${(UFI_Data.unifiedIntegrityIndex ?? 100).toFixed(1)}/100.`);

  const forensicConfidence: ForensicConfidence = {
    level: counterfactuals.length >= 3 ? "high" : "medium",
    reasons: confidenceReasons,
  };

  // Ajustements Actionnables Déterministes (Actionable Improvements)
  const recommendedAdjustments: ForensicActionableAdjustment[] = [];
  proposedAdjustments.forEach(adj => {
    const magnitude = Math.abs(adj.proposedWeightChange || 0);
    if (magnitude > 0.001) {
      recommendedAdjustments.push({
        target: adj.algo,
        action: (adj.proposedWeightChange || 0) > 0 ? "increase" : "decrease",
        magnitude: parseFloat(magnitude.toFixed(4)),
        reason: adj.reason,
      });
    }
  });

  if (recommendedAdjustments.length === 0 && failureMode === "overconfidence") {
    recommendedAdjustments.push({
      target: "ENSEMBLE_CONFIDENCE",
      action: "stabilize",
      magnitude: 0.05,
      reason: "Amortissement de la calibration softmax post-mortem",
    });
  }

  return {
    id: deterministicId,
    drawName,
    date,
    timestamp: parseDateSafely(date).toISOString(),
    combo: [...actualWinningNumbers].sort((a, b) => a - b),
    predictionId,
    drawResultId,
    matches,
    missedOpportunities: missed,
    scoreDivergence: scoreDivergence
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 5),
    spectralDeviations: spectralDeviations.sort((a, b) => a.delta - b.delta),
    rmse,
    kl_divergence,
    wassersteinLoss,
    brier_score,
    shannon_entropy: shannonEntropy,
    continuousTopologicalLoss,
    divergenceMetric,
    drawAnomalyScore,
    modelMissScore,
    structuralQualityScore,
    postMortemStabilityScore,
    failureMode,
    verdict: failureMode,
    severity,
    forensicConfidence,
    dominantCauses,
    recommendedAdjustments,
    warnings,
    entropyCollapse: UFI_Data.entropyCollapse,
    benfordCompliance: UFI_Data.benfordCompliance,
    suspicionScore: UFI_Data.suspicionScore,
    riggedProbability: UFI_Data.riggedProbability,
    unifiedIntegrityIndex: UFI_Data.unifiedIntegrityIndex,
    idealAlgorithmicDriftTolerance: UFI_Data.idealAlgorithmicDriftTolerance,
    evidenceLogs: UFI_Data.evidenceLogs,
    indicators: UFI_Data.indicators,
    z_scores,
    counterfactuals,
    algorithmicDrift,
    nearMisses,
    missedSignals,
    proposedAdjustments,
    aiAnalysis: aiAutopsy?.analysis,
    recommendations: aiAutopsy?.recommendations,
    isBlackSwan:
      aiAutopsy?.isBlackSwan ??
      (cuspBifurcationActive || UFI_Data.isChaoticRegime === true),
    modelUsed: aiAutopsy
      ? "Nexus Forensic Engine (autopsie hypergéométrique locale)"
      : "Nexus Forensic Engine (mesures de base, autopsie désactivée)",
    dnaOrbitingIndex,
    consensusStrength,
    antiConsensusActive,
    challengedTargets,
    topologicalTensionIndex: UFI_Data.topologicalTensionIndex,
    catastropheControlParams: UFI_Data.catastropheControlParams,
    winningXAP,
  };
};
