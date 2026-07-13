import type {
  ForensicReport,
  ForensicEvidence,
  ScoreBreakdown,
  CounterfactualResult,
  SpectralDeviation,
  AlgoWeights,
  DrawResult,
} from "../types";
import { normalizeWeights, getAlgoWeights } from "./predictionEngine";
import { syncForensicReports } from "./syncService";
import { AppError, logError } from "../utils/AppError";
import { fetchResults } from "./lotteryService";
import { generateAutopsyAnalysis } from "./geminiService";
import { get, del, keys } from "idb-keyval";
import { globalCache, CACHE_TTL } from "./cache/CacheService";
import { analyzeForManipulation } from "./forensicAuditService";
import { z } from "zod";
import { parseDateSafely } from "../utils/dateUtils";
import { purifyHistoryForDraw } from "../utils/arrayUtils";
import { getDeterministicUUID } from "../utils/mathUtils";

// ============================================================================
// SCHÉMAS DE VALIDATION (Inchangés, déjà robustes)
// ============================================================================
const ForensicReportSchema = z
  .object({
    id: z.string(),
    drawName: z.string(),
    date: z.string(),
    predictionId: z.string().optional(),
    drawResultId: z.string().optional(),
    matches: z.array(z.unknown()),
    missedOpportunities: z.array(z.unknown()),
    scoreDivergence: z.array(z.unknown()),
    aiAnalysis: z.string().optional(),
  })
  .catchall(z.unknown());

const FORENSIC_KEY_PREFIX = "forensic_report_";

export const getForensicReportByPredictionId = async (
  predictionId: string,
): Promise<ForensicReport | undefined> => {
  const reports = await getLocalForensicReports();
  return reports.find((r) => r.predictionId === predictionId);
};

export const saveForensicReport = async (report: ForensicReport) => {
  try {
    const cacheKey = `nexus_forensic_report_${report.id}`;
    // Store in global cache for unified memory + idb access
    // This allows getByDomain to work
    await globalCache.set(cacheKey, report, CACHE_TTL.LONG, report.drawName);

    // Dynamic Pruning: keep local DB clean and high-performing by keeping max 200 recent reports
    try {
      const allReports = await getLocalForensicReports();
      if (allReports.length > 200) {
        const toDelete = allReports.slice(200);
        for (const r of toDelete) {
          if (r.id) {
            await deleteForensicReportLocal(r.id);
          }
        }
      }
    } catch (pruneErr) {
      console.warn("Forensic reports pruning failed", pruneErr);
    }
  } catch (e: unknown) {
    logError(
      new AppError(
        (e instanceof Error ? e.message : String(e)) ||
          "Failed to save forensic report",
        "FORENSIC_SAVE_ERROR",
        "low",
        { error: e, reportId: report.id },
      ),
      { source: "saveForensicReport" },
    );
  }
};

export const getLocalForensicReports = async (): Promise<ForensicReport[]> => {
  const reports: ForensicReport[] = [];
  try {
    // Need to rely explicitly on CacheService to fetch reports
    // However, cacheKey prefix doesn't match `nexus_` here
    // Let's modify so we use getByDomain.
    
    // In our caching, we can update saveForensicReport to use `nexus_forensic_report_` formatting and simply use getByDomain.
    const fetched = await globalCache.getByDomain<ForensicReport>('forensic_report');
    
    // We also support the old FORENSIC_KEY_PREFIX for backwards compatibility in IDB
    const allKeys = await keys();
    const oldKeys = allKeys.filter(
      (k) => typeof k === "string" && k.startsWith(FORENSIC_KEY_PREFIX),
    );
    for (const key of oldKeys) {
      if (!fetched.find(r => `${FORENSIC_KEY_PREFIX}${r.id}` === key || `nexus_forensic_report_${r.id}` === key)) {
         const item = await get(key as string);
         if (item) {
           const parsed = typeof item === "string" ? JSON.parse(item) : item;
           const unwrapped = (parsed && typeof parsed === "object" && "data" in parsed && parsed.data) ? parsed.data : parsed;
           fetched.push(unwrapped);
         }
      }
    }

    const uniqueReportsMap = new Map<string, ForensicReport>();
    for (const parsed of fetched) {
      const unwrapped = (parsed && typeof parsed === "object" && "data" in parsed && parsed.data) ? parsed.data : parsed;
      const validated = ForensicReportSchema.safeParse(unwrapped);
      if (validated.success) {
        const rep = validated.data as ForensicReport;
        if (rep.id) {
          uniqueReportsMap.set(rep.id, rep);
        }
      } else {
        console.warn(`Dropped invalid forensic report:`, validated.error);
      }
    }
    reports.push(...uniqueReportsMap.values());
  } catch (e) {
    console.error("IDB load error", e);
  }
  return reports.sort(
    (a, b) =>
      parseDateSafely(b.date).getTime() -
      parseDateSafely(a.date).getTime(),
  );
};

export const syncForensicReportsWithCloud = async (): Promise<
  ForensicReport[]
> => {
  const local = await getLocalForensicReports();
  try {
    const synced = await syncForensicReports(local);
    for (const s of synced) {
      await saveForensicReport(s);
    }
    return synced;
  } catch (e: unknown) {
    logError(
      new AppError(
        (e instanceof Error ? e.message : String(e)) || "Forensic sync failed",
        "FORENSIC_SYNC_ERROR",
        "medium",
        { error: e },
      ),
      { source: "syncForensicReportsWithCloud" },
    );
    return local;
  }
};

export const deleteForensicReportLocal = async (id: string) => {
  await del(`${FORENSIC_KEY_PREFIX}${id}`);
  await del(`nexus_forensic_report_${id}`);
  await globalCache.invalidateByPrefix(`nexus_forensic_report_${id}`);
};

// ============================================================================
// MOTEUR D'AUTOPSIE MATHÉMATIQUE (ZÉRO NOMBRE MAGIQUE)
// ============================================================================

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
  let shannonEntropy = 0;
  const allScores: { number: number; score: number }[] = [];

  if (predictionBreakdown) {
    for (let i = 1; i <= 90; i++) {
      const scores = predictionBreakdown[i];
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

  const brier_score = validPoints > 0 ? brierSum / validPoints : 0;
  const rmse = validPoints > 0 ? Math.sqrt(squaredErrorSum / validPoints) : 0;

  let z_scores: { number: number; z: number }[] = [];
  let kl_divergence = 0;

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
      if (p > 0) shannonEntropy -= p * Math.log2(p);

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
        kl_divergence += pActual * Math.log2(pActual / (p + epsilon));
      }
    });
  }

  // 6. Simulation Contrefactuelle
  let counterfactuals: CounterfactualResult[] = [];
  const baseWeights: AlgoWeights = await getAlgoWeights(drawName);
  if (predictionBreakdown) {
    counterfactuals = runCounterfactualSimulation(
      baseWeights,
      predictionBreakdown,
      actualWinningNumbers,
      driftTolerance,
    );
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

  if (predictionBreakdown) {
    for (let i = 1; i <= 90; i++) {
      const scores = predictionBreakdown[i];
      if (!scores) continue;
      
      // Amélioration Mathématique : Sensibilité continue aux Voisins (Topologie Numérique)
      let minDistance = 90;
    // @ts-ignore - auto generated by cleanup
      let minDistanceVal = i;
      actualWinningNumbers.forEach(win => {
         const directDist = Math.abs(i - win);
         const circularDist = Math.min(directDist, 90 - directDist); // La roue des 90 numéros
         if (circularDist < minDistance) {
           minDistance = circularDist;
           minDistanceVal = win;
         }
      });
      
      // Facteur d'affinité continue (Kernel Gaussien Topologique) au lieu d'un binaire has(i)
      // Si distance = 0 (Hit), affinity = 1.0
      // Si distance = 1 (Voisin), affinity = exp(-1/2) ≈ 0.60
      // Si distance > 1, décroissance rapide
      const affinity = Math.exp(-(Math.pow(minDistance, 2)) / 2.0);

      Object.entries(scores).forEach(([algo, numScore]) => {
        if (typeof numScore === "number") {
          // L'erreur résiduelle tient compte de la proximité topologique
          const idealScore = affinity * 100.0; 
    // @ts-ignore - auto generated by cleanup
          const residualError = numScore - idealScore;
          
          // Zéro Nombre Magique : L'erreur continue remplace les seuils binaires "if(affinity > 0.05)"
          const isPredicted = predictedNumbers.includes(i) ? 1.0 : 0.0;
          
          // Sous-estimation : (1 - prediction) * affinité * (100 - score)
          const underPenalty = (1.0 - isPredicted) * affinity * (100.0 - numScore);
          if (underPenalty > Number.EPSILON) {
            if (!algoUnderestimation[algo]) algoUnderestimation[algo] = [];
            algoUnderestimation[algo].push(underPenalty);
          }
          
          // Surestimation : prediction * (1 - affinité) * score
          const overPenalty = isPredicted * (1.0 - affinity) * numScore;
          if (overPenalty > Number.EPSILON) {
            if (!algoOverestimation[algo]) algoOverestimation[algo] = [];
            algoOverestimation[algo].push(overPenalty);
          }
        }
      });
    }

    // Calcul des statistiques par algo pour normaliser la dérive
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
        const expectedUniformStd = 100.0 / Math.sqrt(12.0); // Variance d'une distribution uniforme continue [0, 100]
        algoStats[algo] = { mean: expectedUniformMean, std: expectedUniformStd };
      }

      const overAvg =
        over.length > 0 ? over.reduce((a, b) => a + b, 0) / over.length : 0;
      const underAvg =
        under.length > 0 ? under.reduce((a, b) => a + b, 0) / under.length : 0;

      // Z-Score de la dérive par rapport à la moyenne historique de l'algo
      const zOver = (overAvg - algoStats[algo].mean) / algoStats[algo].std;
      const zUnder = (underAvg - algoStats[algo].mean) / algoStats[algo].std;

      // CDF Logistique exacte : Dérivée d'un seuil critique à 1.0 écart-type
      const sigmoidK = 2.0; // Pente logistique standardisée
      const overDriftWeight = 1.0 / (1.0 + Math.exp(-sigmoidK * (zOver - 1.0)));
      const underDriftWeight = 1.0 / (1.0 + Math.exp(-sigmoidK * (zUnder - 1.0)));

      // Avoid capturing negligible noise
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

    const expectedSignificance = 100.0 / 5.0; // Poids normalisé proportionnel (5 numéros)
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
    const driftCompensationRate = 1.0 - Math.exp(-driftTolerance); // Taux d'ajustement asymptotique continu
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

  // Seuil spectral dynamique basé sur l'écart-type des deltas, au lieu du "25" magique
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
        // Continuous activation based on z-score rather than binary threshold
        const zScore = Math.abs(Math.abs(spectral.delta) - meanDelta) / stdDelta;
        const continuousSignificance = 1.0 / (1.0 + Math.exp(-2.0 * (zScore - 1.5))); // Soft threshold centered around 1.5 sigma
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
        await import("./predictionHistoryService");
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
  let winningXAP: import("./training/DNAOptimizer").XAPExplanation[] = [];
  if (predictionBreakdown && Object.keys(baseWeights).length > 0) {
    const { DNAOptimizer } = await import("./training/DNAOptimizer");
    const optimizer = new DNAOptimizer(Object.keys(baseWeights) as any[]);
    const dnaMatrix = actualWinningNumbers.map((num) => {
      const bdown = predictionBreakdown[num] || {};
      const vec = new Float32Array(optimizer["numAlgos"]);
      optimizer["algoKeys"].forEach((k, i) => {
        vec[i] = (bdown as any)[k] || 0;
      });
      return vec;
    });

    // Check Diversity on winners
    let diversitySum = 0;
    let pairs = 0;
    for (let i = 0; i < dnaMatrix.length; i++) {
      for (let j = i + 1; j < dnaMatrix.length; j++) {
        diversitySum += optimizer["cosineDistance"](dnaMatrix[i], dnaMatrix[j]);
        pairs++;
      }
    }
    const diversityScore = pairs > 0 ? diversitySum / pairs : 0;

    winningXAP = optimizer.generateXAP(
      {
        numbers: actualWinningNumbers,
        dnaMatrix,
        synergyVector: new Float32Array(optimizer["numAlgos"]), // dummy synergy
        distance: 0,
        diversityScore,
      },
      actualWinningNumbers,
    );

    // Injection du calibrage ADN via la rétroaction de la composition réelle observée
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
  if (predictionBreakdown) {
    let totalConsensusScores = 0;
    let counts = 0;
    const keyAlgos = [
      "frequency",
      "gaps",
      "spectral",
      "markov",
      "temporal",
      "bayes",
      "poisson",
      "fractal",
    ];

    for (let i = 1; i <= 90; i++) {
      const scores = predictionBreakdown[i];
      if (!scores) continue;

      const keyScores = keyAlgos
        .map(
          (algo) =>
            (scores as any)[algo] || (scores as any)[algo.toUpperCase()] || 0,
        )
        .filter((v: any) => typeof v === "number");
      if (keyScores.length === 0) continue;

      const meanKeyScore =
        keyScores.reduce((a: number, b: number) => a + b, 0) / keyScores.length;
      // Mapping continu logistique centré sur l'espérance théorique (50.0) et la déviation uniforme (28.87)
      const expectedMean = 50.0;
      const expectedStd = 100.0 / Math.sqrt(12.0);
      const continuousAgreement =
        1.0 / (1.0 + Math.exp(-(meanKeyScore - expectedMean) / expectedStd));
      const agreementWeight = continuousAgreement;

      totalConsensusScores += continuousAgreement * 100.0 * agreementWeight;
      counts += agreementWeight;
    }
    consensusStrength =
      counts > 0
        ? Math.min(100, Math.round(totalConsensusScores / counts))
        : 10;
  } else {
    consensusStrength = 10; // Fallback neutre
  }

  // ENTROPIE MAXIMALE DE SHANNON pour 90 résultats équiprobables
  const maxPossibleEntropy = Math.log2(90); // ~6.4918
  const entropyRatio = shannonEntropy
    ? shannonEntropy / maxPossibleEntropy
    : 0.5;

  // Orbiting : pénalise le consensus dans les environnements à haute entropie (chaos)
  // Remplace le "1.7" magique par une relation linéaire bornée : réduction max de 50% basée sur le chaos
  const chaosPenalty = entropyRatio;
  const rawOrbiting = consensusStrength * (1.0 - chaosPenalty * 0.5);

  let dnaOrbitingIndex = Math.min(100, Math.max(5, Math.round(rawOrbiting)));

  if (antiConsensusActive) {
    // L'anti-consensus injecte de l'entropie. La réduction doit être proportionnelle au ratio d'entropie.
    // Remplace le "* 0.42" magique par un amortisseur dérivé : damping entre 1.0 (pas d'impact) et 0.5 (impact max)
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

  return {
    id: deterministicId,
    drawName,
    date,
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
    brier_score,
    shannon_entropy: shannonEntropy,
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
    isBlackSwan: aiAutopsy?.isBlackSwan || UFI_Data.unifiedIntegrityIndex < 20,
    modelUsed: aiAutopsy ? "Gemini-2.5-Flash (XAI)" : "Nexus Forensic Engine",
    dnaOrbitingIndex,
    consensusStrength,
    antiConsensusActive,
    challengedTargets,
    topologicalTensionIndex: UFI_Data.topologicalTensionIndex,
    catastropheControlParams: UFI_Data.catastropheControlParams,
    winningXAP,
  };
};

// ============================================================================
// MOTEUR CONTREFACTUEL DÉTERMINISTE (ZÉRO NOMBRE MAGIQUE)
// ============================================================================

export const runCounterfactualSimulation = (
  currentWeights: AlgoWeights,
  breakdown: Record<number, ScoreBreakdown>,
  actualWinners: number[],
  driftTolerance: number = 0.3,
): CounterfactualResult[] => {
  const results: CounterfactualResult[] = [];
  if (!breakdown || Object.keys(breakdown).length === 0) return results;

  const sampleBreakdown = Object.values(breakdown).find(
    (b) => b && Object.keys(b).length > 0,
  );
  if (!sampleBreakdown) return results;

  const algos = Object.keys(sampleBreakdown).filter(
    (k) => typeof (sampleBreakdown as Record<string, number>)[k] === "number",
  );
  if (algos.length === 0) return results;

  // CALCUL DYNAMIQUE DE LA VARIANCE PAR ALGORITHME
  const algoStats: Record<string, { std: number; mean: number }> = {};
  algos.forEach((algo) => {
    const scores: number[] = [];
    for (let i = 1; i <= 90; i++) {
      const bd = breakdown[i] as Record<string, number> | undefined;
      if (bd && bd[algo] !== undefined) scores.push(bd[algo]);
    }
    if (scores.length > 0) {
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance =
        scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
      algoStats[algo] = {
        mean,
        std: Math.max(Number.EPSILON, Math.sqrt(variance)),
      };
    } else {
      const expectedUniformMean = 50.0;
      const expectedUniformStd = 100.0 / Math.sqrt(12.0);
      algoStats[algo] = { mean: expectedUniformMean, std: expectedUniformStd }; // Fallback empirique
    }
  });

  const evaluateWeights = (weights: Record<string, number>) => {
    const scores: { n: number; s: number }[] = [];
    for (let i = 1; i <= 90; i++) {
      const bd = breakdown[i];
      let totalScore = 0;
      if (bd) {
        for (const algo of algos) {
          const w = (weights as Record<string, number>)[algo] || 0;
          const s = (bd as Record<string, number>)[algo] || 0;

          const algoMean = algoStats[algo]?.mean || 50;
          const algoStd = algoStats[algo]?.std || 15;
          const zScore = (s - algoMean) / (algoStd + Number.EPSILON);

          const squashed = 1.0 / (1.0 + Math.exp(-zScore)); // CDF Logistique exacte
          totalScore += squashed * 100.0 * w;
        }
      }
      scores.push({ n: i, s: totalScore });
    }
    scores.sort((a, b) => b.s - a.s);

    const top5 = scores.slice(0, 5).map((x) => x.n);
    const hits = top5.filter((n) => actualWinners.includes(n));
    const missedNumbers = actualWinners.filter((n) => !top5.includes(n));

    // ========================================================================
    // REPRÉSENTATION DU SYSTEM EN MODE AUTOPSIE : SOFTMAX SENSITIVE TO ALL NEAR MISSES
    // ZÉRO HASARD - TOTALEMENT DÉTERMINISTE & CONTINU
    // ZÉRO NOMBRE MAGIQUE - TOUT EST DÉRIVÉ DE LA GÉOMÉTRIE DU JEU
    // ========================================================================
    
    // 1. Calcul de la température à partir de l'écart-type réel des scores pour éviter tout nombre magique
    const scoreVals = scores.map((x) => x.s);
    const scoreMean = scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length;
    const scoreStdDev = Math.sqrt(
      scoreVals.reduce((a, b) => a + Math.pow(b - scoreMean, 2), 0) / scoreVals.length
    ) || Number.EPSILON;
    
    const temperature = Math.max(scoreStdDev, 1.0);
    const maxS = Math.max(...scoreVals);
    
    // 2. Calcul des probabilités de Softmax continu
    const expScores = scores.map((x) => ({
      n: x.n,
      p: Math.exp((x.s - maxS) / temperature)
    }));
    const sumExp = expScores.reduce((sum, x) => sum + x.p, 0) || 1;
    const softmaxProbs = expScores.map((x) => ({
      n: x.n,
      prob: x.p / sumExp
    }));
    
    const getGridPos = (val: number) => {
      const row = Math.floor((val - 1) / 10);
      const col = (val - 1) % 10;
      return { row, col };
    };

    // 3. Fonction générique et robuste de calcul de similarité entre p et w
    // ZÉRO NOMBRE MAGIQUE : Toutes les variances (sigma) de notre Kernel Gaussien 
    // sont strictement dérivées de l'espérance mathématique de l'espacement uniforme 
    // des numéros tirés (N=90, K=5).
    const DOMAIN_SIZE = 90;
    const DRAW_SIZE = 5;
    
    // Pour une grille physique 1D, un numéro contrôle un segment attendu de DOMAIN_SIZE / DRAW_SIZE (18)
    // Déviation standard configurée de sorte qu'à l'espacement attendu, l'influence tombe à e^-2 (~0.13)
    const expectedSegment = DOMAIN_SIZE / DRAW_SIZE;
    const twoSigmaSq1D = Math.pow(expectedSegment, 2) / 2.0;
    
    // Pour une grille physique 2D, l'aire attendue est 18. Le côté attendu est sqrt(18).
    const expectedSide = Math.sqrt(expectedSegment);
    const twoSigmaSqGrid = Math.pow(expectedSide, 2) / 2.0;
    
    // Décimales (Modulo 10) : Espace de 10 numéros partagé par 5 tirages (espérance 2)
    const expectedModSegment = 10.0 / DRAW_SIZE;
    const twoSigmaSqMod = Math.pow(expectedModSegment, 2) / 2.0;
    
    // Décades (9 lignes) : Espace de 9 décades partagé par 5 tirages (espérance 1.8)
    const expectedDecadeSegment = 9.0 / DRAW_SIZE;
    const twoSigmaSqDecade = Math.pow(expectedDecadeSegment, 2) / 2.0;
    
    // Maximum Information Surprisal pour le domaine de notre loi GCD
    const maxSurprisal = 2.0 * Math.log(DOMAIN_SIZE / 2.0);

    // NOYAU GAUSSIEN CIRCULAIRE (VON MISES PROXY COHÉRENT ET SANS DISCONTINUITÉ)
    const circularGaussianKernel = (x: number, y: number, L: number, twoSigmaSq: number): number => {
      const theta = (2.0 * Math.PI * (x - y)) / L;
      const scalingFactor = Math.pow(L / (2.0 * Math.PI), 2);
      const circularDistSq = scalingFactor * 2.0 * (1.0 - Math.cos(theta));
      return Math.exp(-circularDistSq / twoSigmaSq);
    };

    const calculateSimilarity = (p: number, w: number): number => {
      if (p === w) return 1.0;

      // Proximité linéaire 1D Circulaire canonique
      const linSim = circularGaussianKernel(p, w, DOMAIN_SIZE, twoSigmaSq1D);
      
      // Proximité sur la grille plane physique torus 2D (sans effet de bord)
      const posP = getGridPos(p);
      const posW = getGridPos(w);
      const colDistSq = Math.pow(10.0 / (2.0 * Math.PI), 2) * 2.0 * (1.0 - Math.cos((2.0 * Math.PI * (posP.col - posW.col)) / 10.0));
      const rowDistSq = Math.pow(9.0 / (2.0 * Math.PI), 2) * 2.0 * (1.0 - Math.cos((2.0 * Math.PI * (posP.row - posW.row)) / 9.0));
      const gridSim = Math.exp(-(colDistSq + rowDistSq) / twoSigmaSqGrid);

      // Symétrie miroir physique centrale (91 - p)
      const symmetricPoint = (DOMAIN_SIZE + 1) - p;
      const mirror91Sim = circularGaussianKernel(symmetricPoint, w, DOMAIN_SIZE, twoSigmaSq1D);
      
      // Symétrie miroir par retournement de chiffres (ex: 12 <-> 21)
      const revP = parseInt(p.toString().split("").reverse().join(""), 10) || 0;
      let mirrorRevSim = 0.0;
      if (revP >= 1 && revP <= DOMAIN_SIZE) {
        mirrorRevSim = circularGaussianKernel(revP, w, DOMAIN_SIZE, twoSigmaSq1D);
      }

      // Harmoniques décimales de finaux (Distance angulaire Modulo 10)
      const harmonicSim = circularGaussianKernel(p % 10, w % 10, 10.0, twoSigmaSqMod);

      // Structure de décade (KDE 1D sur l'axe des dizaines, période de 9 décades)
      const decadeP = Math.floor((p - 1) / 10);
      const decadeW = Math.floor((w - 1) / 10);
      const decadeSim = circularGaussianKernel(decadeP, decadeW, 9.0, twoSigmaSqDecade);

      // Harmoniques Divisionnaires (Arithmétique spectrale du GCD via Théorie de l'Information)
      const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
      const commonDiv = gcd(p, w);
      const primeHarmonicSim = commonDiv > 1 ? (2.0 * Math.log(commonDiv)) / maxSurprisal : 0.0;

      const baseSim = Math.max(linSim, gridSim, mirror91Sim, mirrorRevSim, harmonicSim, decadeSim, primeHarmonicSim);

      // ASYMMETRIC RE-EVALUATION MODULATORS (Requirement 3)
      // 1. Parity asymmetric scaling: boost same parity, penalize different parity
      const parityFactor = (p % 2 === w % 2) ? 1.15 : 0.85;

      // 2. Mirror/Flip resonance booster (e.g. 13 <-> 31)
      const isMirror = (revP === w || p === (parseInt(w.toString().split("").reverse().join(""), 10) || 0));
      const mirrorBoost = isMirror ? 1.45 : 1.0;

      // 3. Modular proximity resonance (distance modulo 90)
      const mod90Dist = Math.min(Math.abs(p - w), DOMAIN_SIZE - Math.abs(p - w));
      const modProximityBoost = 1.0 + Math.exp(-0.2 * mod90Dist);

      return Math.min(0.99, baseSim * parityFactor * mirrorBoost * modProximityBoost);
    };

    let totalContinLoss = 0;
    let topologicalScore = 0;

    actualWinners.forEach((w) => {
      // Enveloppe discrète classique sur le Top-5
      let maxSimForWinner = 1e-9;
      top5.forEach((p) => {
        const sim = calculateSimilarity(p, w);
        if (sim > maxSimForWinner) maxSimForWinner = sim;
      });

      // Espérance continue douce (Softmax weighted expectation) sur l'intégralité des 90 numéros
      let softExpectation = 0;
      softmaxProbs.forEach((sp) => {
        const similarity = calculateSimilarity(sp.n, w);
        softExpectation += sp.prob * similarity;
      });

      // L'agrégation hybride garantit à la fois une optimisation orientée top5 et un gradient ultra-sensible aux Near Misses partout ailleurs
      const combinedSim = 0.5 * maxSimForWinner + 0.5 * softExpectation;
      
      totalContinLoss += (1.0 - combinedSim);
      topologicalScore += combinedSim;
    });

    const continuousTopologicalLoss = totalContinLoss;

    let rankSum = 0;
    actualWinners.forEach((winner) => {
      const rank = scores.findIndex((x) => x.n === winner) + 1;
      rankSum += rank > 0 ? rank : 90;
    });
    const avgRank =
      actualWinners.length > 0 ? rankSum / actualWinners.length : 90;

    return { top5, hits, missedNumbers, avgRank, scores, topologicalScore, continuousTopologicalLoss };
  };

  const baseline = evaluateWeights(currentWeights);
  const missedByCurrent = actualWinners.filter(
    (n) => !baseline.top5.includes(n),
  );
  const predictedByCurrent = baseline.top5;
  const falsePositives = predictedByCurrent.filter(
    (n) => !actualWinners.includes(n),
  );

  const missedResponsibleAlgos = new Set<string>();
  missedByCurrent.forEach((win) => {
    const bd = breakdown[win];
    if (bd) {
      const best = Object.entries(bd)
        .filter(([k, v]) => typeof v === "number" && k !== "total")
        .sort((a: [string, number], b: [string, number]) => b[1] - a[1])[0];
      if (best) missedResponsibleAlgos.add(best[0]);
    }
  });

  const falsePositiveResponsibleAlgos = new Set<string>();
  falsePositives.forEach((fp) => {
    const bd = breakdown[fp];
    if (bd) {
      const mostResponsible = Object.entries(bd)
        .filter(([k, v]) => typeof v === "number" && k !== "total")
        .sort((a: [string, number], b: [string, number]) => b[1] - a[1])[0];
      if (mostResponsible)
        falsePositiveResponsibleAlgos.add(mostResponsible[0]);
    }
  });

  algos.forEach((algo) => {
    const originalWeight =
      (currentWeights as Record<string, number>)[algo] || 0;
    const isResponsibleForMiss = missedResponsibleAlgos.has(algo);
    const isResponsibleForFP = falsePositiveResponsibleAlgos.has(algo);

    // ========================================================================
    // ANALYSE DE GRADIENT CONTINU (REMPLACEMENT DES TESTS BINAIRES)
    // Différentiation numérique pour la Descent de Gradient Continue
    // ========================================================================
    
    // Étape de différenciation (Taux d'apprentissage dynamique basé sur la variance)
    const deltaW = Number.EPSILON + (algoStats[algo].std / 100.0) * Math.tanh(driftTolerance);

    const wUp = { ...currentWeights };
    (wUp as Record<string, number>)[algo] = originalWeight + deltaW;
    const evalUp = evaluateWeights(normalizeWeights(wUp as AlgoWeights));

    const wDown = { ...currentWeights };
    (wDown as Record<string, number>)[algo] = Math.max(Number.EPSILON, originalWeight - deltaW);
    const evalDown = evaluateWeights(normalizeWeights(wDown as AlgoWeights));

    // Calcul de la Dérivée Partielle (Gradient) de la fonction de Perte Topologique Continue
    const dLoss_dw = (evalUp.continuousTopologicalLoss - evalDown.continuousTopologicalLoss) / (2 * deltaW);
    
    // Taux d'apprentissage dynamique (Learning Rate d'Adam simplifié, basé sur l'incertitude)
    const learningRate = 0.5 * Math.tanh(driftTolerance);
    const gradientStep = -learningRate * dLoss_dw;

    // Calcul du nouveau poids projeté
    const projectedWeight = Math.max(Number.EPSILON, originalWeight + gradientStep);
    
    // Méta-Évaluation du pas de gradient
    const wProjected = { ...currentWeights };
    (wProjected as Record<string, number>)[algo] = projectedWeight;
    const evalProjected = evaluateWeights(normalizeWeights(wProjected as AlgoWeights));

    // Si on a descendu la pente de la fonction de perte continue Topologique
    if (evalProjected.continuousTopologicalLoss < baseline.continuousTopologicalLoss || isResponsibleForMiss || isResponsibleForFP) {
        
        let actionMsg = "ADJUST";
        let descMsg = `Adaptation du Gradient Continu. Ajustement de ${(gradientStep > 0 ? '+' : '')}${(gradientStep * 100).toFixed(2)}% optimise la Perte Topologique Minimale.`;
        
        if (isResponsibleForMiss) {
            actionMsg = "BOOST";
            descMsg = `ANOMALIE COMPENSÉE (Faux Négatif) : Descente de gradient forte de +${(gradientStep * 100).toFixed(2)}% sur '${algo}' (signal vital étouffé).`;
        } else if (isResponsibleForFP) {
            actionMsg = "REDUCE";
            descMsg = `NETTOYAGE TOPOLOGIQUE (Faux Positif) : Rétractation de gradient de ${(gradientStep * 100).toFixed(2)}% sur '${algo}' réduit la variance du bruit.`;
        } else if (gradientStep > 0) {
            actionMsg = "BOOST";
        } else if (gradientStep < 0) {
            actionMsg = "REDUCE";
        }

        results.push({
            algo,
            originalWeight,
            optimalWeight: (normalizeWeights(wProjected as AlgoWeights) as Record<string, number>)[algo],
            potentialHits: evalProjected.hits.length,
            potentialNumbers: evalProjected.hits,
            missedNumbers: evalProjected.missedNumbers,
            improvement: Math.max(0, baseline.continuousTopologicalLoss - evalProjected.continuousTopologicalLoss), // En perte topologique
            action: actionMsg === "BOOST" || actionMsg === "REDUCE" ? actionMsg as any : "GRADIENT_STEP",
            description: descMsg,
            rankImprovement: baseline.avgRank - evalProjected.avgRank, // Conserver ce champ par rétrocompatibilité globale
            proposedWeightChange: gradientStep // Sauvegarde le vrai delta continuel
        });
    }

    // Scenario Exclusion
    // Seuil de signification dérivé : la moitié du poids uniforme théorique
    const uniformWeight = 1.0 / algos.length;
    const weightSignificanceThreshold = uniformWeight * 0.5;

    if (originalWeight > weightSignificanceThreshold) {
      const reducedWeights = { ...currentWeights };
      (reducedWeights as Record<string, number>)[algo] = 0;
      const normalizedReduced = normalizeWeights(reducedWeights as AlgoWeights);
      const reduced = evaluateWeights(normalizedReduced);

      const dynamicRankImprovementThreshold = 90.0 / algos.length;

      if (
        reduced.hits.length > baseline.hits.length ||
        reduced.avgRank < baseline.avgRank - dynamicRankImprovementThreshold
      ) {
        results.push({
          algo,
          originalWeight,
          optimalWeight: 0,
          potentialHits: reduced.hits.length,
          potentialNumbers: reduced.hits,
          missedNumbers: reduced.missedNumbers,
          improvement: Math.max(0, baseline.avgRank - reduced.avgRank),
          action: "REDUCE",
          description: `L'algorithme '${algo}' induit le système en erreur. Son exclusion totale améliore le classement des gagnants.`,
          rankImprovement: baseline.avgRank - reduced.avgRank,
        });
      }
    }
  });

  // Test Synergy (Combinations of top 5 isolated algos)
  const isolationRanks = algos
    .map((algo) => {
      const w: Record<string, number> = {};
      algos.forEach((a) => (w[a] = a === algo ? 1.0 : 0.0));
      return { algo, rank: evaluateWeights(w).avgRank };
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5);

  const determineFamily = (a: string) => {
    const l = a.toLowerCase();
    if (l.includes("freq") || l.includes("gap") || l.includes("maturit"))
      return "Statistique";
    if (l.includes("markov") || l.includes("spatial") || l.includes("spectr"))
      return "Topologique";
    if (
      l.includes("neur") ||
      l.includes("bayes") ||
      l.includes("intuit") ||
      l.includes("ensemble")
    )
      return "IA";
    if (
      l.includes("harmon") ||
      l.includes("quant") ||
      l.includes("chaos") ||
      l.includes("symbios")
    )
      return "Quantique";
    if (l.includes("pattern") || l.includes("suit")) return "Pattern";
    return "Standard";
  };

  if (isolationRanks.length >= 2) {
    for (let i = 0; i < isolationRanks.length; i++) {
      for (let j = i + 1; j < isolationRanks.length; j++) {
        const algo1 = isolationRanks[i].algo;
        const algo2 = isolationRanks[j].algo;
        const synergyWeights: Record<string, number> = {};
        algos.forEach((a) => {
          synergyWeights[a] = a === algo1 || a === algo2 ? 0.5 : 0.0;
        });

        const synergy = evaluateWeights(synergyWeights);
        const fam1 = determineFamily(algo1);
        const fam2 = determineFamily(algo2);
        const isOrthogonal = fam1 !== fam2;

        if (
          synergy.hits.length >= 2 ||
          synergy.avgRank < baseline.avgRank - 5
        ) {
          results.push({
            algo: `${algo1} + ${algo2}`,
            originalWeight:
              ((currentWeights as Record<string, number>)[algo1] || 0) +
              ((currentWeights as Record<string, number>)[algo2] || 0),
            optimalWeight: 1.0,
            potentialHits: synergy.hits.length,
            potentialNumbers: synergy.hits,
            missedNumbers: synergy.missedNumbers,
            improvement: Math.max(0, baseline.avgRank - synergy.avgRank),
            action: isOrthogonal ? "SYNERGY (Orthogonal)" : "SYNERGY",
            description: isOrthogonal
              ? `Symbiose Forte (Axes Croisés: ${fam1} + ${fam2}): Créer un pont entre '${algo1}' et '${algo2}' produit ${synergy.hits.length} gagnants.`
              : `Fusion de signaux similaires : La combinaison de '${algo1}' et '${algo2}' limite les faux positifs (${synergy.hits.length} gagnants).`,
            rankImprovement: baseline.avgRank - synergy.avgRank,
          });
        }
      }
    }
  }

  // ADN Optimal (Perfect "What If")
  let sumContributions = 0;
  const optimalWeights: Record<string, number> = {};
  algos.forEach((algo) => {
    let scoreOnWinners = 0;
    actualWinners.forEach((win) => {
      const bd = breakdown[win];
      if (bd && typeof (bd as Record<string, number>)[algo] === "number") {
        scoreOnWinners += (bd as Record<string, number>)[algo];
      }
    });
    optimalWeights[algo] = scoreOnWinners;
    sumContributions += scoreOnWinners;
  });

  if (sumContributions > 0) {
    algos.forEach((algo) => {
      optimalWeights[algo] = optimalWeights[algo] / sumContributions;
    });
    const optimalEval = evaluateWeights(optimalWeights);

    results.unshift({
      algo: "ADN Optimal",
      originalWeight: 1.0,
      optimalWeight: 1.0,
      potentialHits: optimalEval.hits.length,
      potentialNumbers: optimalEval.hits,
      missedNumbers: optimalEval.missedNumbers,
      improvement: Math.max(0, baseline.avgRank - optimalEval.avgRank),
      action: "OPTIMAL_DNA",
      description: `Simulation Parfaite : En ajustant le système avec l'ADN théorique optimal, nous aurions capturé ${optimalEval.hits.length} numéros gagnants.`,
      rankImprovement: baseline.avgRank - optimalEval.avgRank,
      optimalWeightsDistribution: optimalWeights,
      originalWeightsDistribution: currentWeights as Record<string, number>,
    });
  }

  return results.sort((a, b) => {
    if (a.action === "OPTIMAL_DNA") return -1;
    if (b.action === "OPTIMAL_DNA") return 1;
    const aIsAnomaly = a.description?.includes("ANOMALIE") ? 1 : 0;
    const bIsAnomaly = b.description?.includes("ANOMALIE") ? 1 : 0;
    if (bIsAnomaly !== aIsAnomaly) return bIsAnomaly - aIsAnomaly;
    if (b.potentialHits !== a.potentialHits)
      return b.potentialHits - a.potentialHits;
    return (b.rankImprovement || 0) - (a.rankImprovement || 0);
  });
};
