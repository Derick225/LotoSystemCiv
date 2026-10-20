import { DrawResult, ForensicReport } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";
import { logger } from "../../utils/logger";
import { getLocalForensicReports } from "../postPredictionAnalysisService";
import { detectGameRegime } from "../mathService";
import { ScoredNumber } from "./scoringEngine";
import { getMedian, getStdDev } from "./microSgd";
import { parseDateSafely } from "../../utils/dateUtils";
import type { PredictionRuntimeContext } from "./predictionOrchestrator";

/**
 * Application des ajustements forensiques / Scénario D
 */
export const applyForensicAdjustments = async (
  drawName: string,
  history: DrawResult[],
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

  // Si l'optimisation Forensic est désactivée, neutralisation absolue immédiate
  if (!isForensicOptimized) {
    return {
      recentReports: [],
      proximityScores,
      missedScores,
      driftScores,
      dynamicWeightModifiers,
      oracleDriftMap,
    };
  }

  let reports = preloadedForensicReports;
  if (!reports) {
    try {
      reports = await getLocalForensicReports();
    } catch (e) {
      logger.warn(e, "[forensicAdjustments] Échec du chargement des rapports forensiques locaux.");
    }
  }

  // Garde anti-fuite (causalité) : en backtesting walk-forward, `history` est la tranche STRICTEMENT
  // antérieure au tirage cible. Un rapport forensic daté après le plus récent tirage connu de cette
  // tranche décrit le tirage cible (ou un tirage futur) et révélerait ses gagnants → on ne conserve
  // que les rapports dont la date est ≤ celle du dernier tirage causalement disponible.
  const causalCutoff = (history && history.length > 0)
    ? Math.max(...history.map(d => parseDateSafely(d.date).getTime()))
    : Number.POSITIVE_INFINITY;

  const recentReports = (reports || []).filter(r =>
    r.drawName === drawName && parseDateSafely(r.date).getTime() <= causalCutoff
  );

  if (recentReports.length === 0) {
    logger.debug("[forensicAdjustments] Scénario D : Rapport forensique indisponible pour ce tirage. Ajustements neutralisés.");
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

  const entropy = gameRegimeInfo?.entropy || 0.5;
  const volatility = (gameRegimeInfo?.volatility || 50.0) / 100.0;
  const prudenceFactor = Math.exp(-(entropy + volatility));

  // Age decay half-life derived from the number of reports used:
  // lambda = log(2) / numReports ensures the oldest report has weight ~0.5 of the newest
  const numReports = sortedReports.length || 1;
  const decayLambda = Math.log(2) / numReports;

  sortedReports.forEach((report, index) => {
    const ageDecay = Math.exp(-decayLambda * index) * prudenceFactor;

    if (report.missedOpportunities) {
      report.missedOpportunities.forEach(opp => {
        const num = opp.number;
        if (num >= 1 && num <= 90) {
          const w = opp.continuousWeight !== undefined ? opp.continuousWeight : 0.5;
          missedScores[num] = (missedScores[num] || 0) + w * ageDecay;
          
          if (opp.bestAlgo) {
            const algoKey = opp.bestAlgo as AlgoKey;
            if (!dynamicWeightModifiers[num]) dynamicWeightModifiers[num] = {};
            // Modifier amplitude = 1/numAlgos ensures scale-invariance across algo count
            const numAlgos = Object.keys(AlgoKey).length || 1;
            dynamicWeightModifiers[num][algoKey] = (dynamicWeightModifiers[num][algoKey] || 0) + (1.0 / numAlgos) * ageDecay;
          }
        }
      });
    }

    if (report.nearMisses) {
      report.nearMisses.forEach(miss => {
        const actual = miss.actual;
        if (actual >= 1 && actual <= 90) {
          // Variance continue de l'erreur spatio-topologique dérivée de la distance observée
          const sigma = Math.max(1.0, miss.distance);
          const twoSigmaSq = 2.0 * sigma * sigma;
          const numAlgos = Object.keys(AlgoKey).length || 1;

          // Diffusion d'une onde Gaussienne continue sur le tore cyclique Z/90Z
          for (let n = 1; n <= 90; n++) {
            const rawDiff = Math.abs(n - actual);
            const cyclicDist = Math.min(rawDiff, 90 - rawDiff);
            const gaussianKernel = Math.exp(-(cyclicDist * cyclicDist) / twoSigmaSq);

            // Seuil d'évanescence machine (1e-4) pour éliminer les résidus négligeables sans discontinuité perçue
            if (gaussianKernel > 1e-4) {
              const continuousBoost = gaussianKernel * ageDecay;
              proximityScores[n] = (proximityScores[n] || 0) + continuousBoost;

              // Si un algorithme précis est identifié à l'origine du quasi-succès (near-miss),
              // modulation continue de ses poids sur les zones d'onde de résonance
              if (miss.algo) {
                const algoKey = miss.algo as AlgoKey;
                if (!dynamicWeightModifiers[n]) dynamicWeightModifiers[n] = {};
                dynamicWeightModifiers[n][algoKey] =
                  (dynamicWeightModifiers[n][algoKey] || 0) + (continuousBoost / numAlgos);
              }
            }
          }
        }
      });
    }

    if (report.algorithmicDrift) {
      report.algorithmicDrift.forEach(drift => {
        const algo = drift.algo as AlgoKey;
        const score = drift.driftScore || 0.1;
        const factor = drift.direction === 'underestimating' ? 1.0 : -1.0;
        
        oracleDriftMap[algo] = (oracleDriftMap[algo] || 0) + factor * score * ageDecay;
        
        const breakdownNums = Object.keys(algoBreakdowns).map(Number);
        if (breakdownNums.length > 0) {
          for (const num of breakdownNums) {
            const breakdownVal = algoBreakdowns[num]?.[algo] || 0;
            if (breakdownVal > 0) {
              driftScores[num] = (driftScores[num] || 0) + factor * score * breakdownVal * ageDecay;
            }
            if (!dynamicWeightModifiers[num]) dynamicWeightModifiers[num] = {};
            const numAlgos2 = Object.keys(AlgoKey).length || 1;
            dynamicWeightModifiers[num][algo] = (dynamicWeightModifiers[num][algo] || 0) + factor * score * (1.0 / numAlgos2) * ageDecay;
          }
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
