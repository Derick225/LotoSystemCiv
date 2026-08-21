import { DrawResult, ForensicReport } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";
import { logger } from "../../utils/logger";
import { getLocalForensicReports } from "../postPredictionAnalysisService";
import { detectGameRegime } from "../mathService";
import { ScoredNumber } from "./scoringEngine";
import { getMedian, getStdDev } from "./microSgd";
import type { PredictionRuntimeContext } from "./predictionOrchestrator";

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
      logger.warn(e, "[forensicAdjustments] Échec du chargement des rapports forensiques locaux.");
    }
  }

  const recentReports = (reports || []).filter(r => r.drawName === drawName);

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
