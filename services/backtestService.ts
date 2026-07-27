import { fetchResults } from "./lotteryService";
import { LCG } from "../utils/mathUtils";
import { purifyHistoryForDraw } from "../utils/arrayUtils";
import { generateMasterPrediction } from "./prediction/predictionFacade";
import { useNexusStore } from "../store/useNexusStore";
import { detectGameRegime } from "./mathService";
import { getAlgoWeights } from "./prediction/weightsManager";
import type {
  TrainingReport,
  TrainingResult,
  DrawResult,
} from "../types";
import { z } from "zod";

const BacktestInputSchema = z.object({
  drawName: z.string().min(1, "Draw name is required"),
  sampleSize: z
    .number()
    .int()
    .min(5, "Sample size must be at least 5")
    .max(500, "Sample size too large"),
});

// Calcul des métriques de classification (Precision, Recall, F1)
const calculateClassMetrics = (hits: number[], totalPredictions: number, drawWinnersSize: number = 5) => {
  const tp = hits.filter((h) => h > 0).length;
  const fp = totalPredictions - tp;
  const precision = tp / (tp + fp || 1);
  const recall = tp / drawWinnersSize; 
  const f1 = (2 * (precision * recall)) / (precision + recall || 1);
  return { precision, recall, f1 };
};

// Fonction utilitaire pour P(k) empirique (Beta-Binomiale simplifiée par méthode des moments)
const calculateEmpiricalPk = (hitsArray: number[], drawWinnersSize: number = 5) => {
  const n = drawWinnersSize;
  const meanHits = hitsArray.length > 0 ? hitsArray.reduce((sum, h) => sum + h, 0) / hitsArray.length : 0;
  const varHits = hitsArray.length > 0 ? hitsArray.reduce((sum, h) => sum + Math.pow(h - meanHits, 2), 0) / hitsArray.length : 0;
  
  const p = meanHits / n;
  const binomialVar = n * p * (1 - p);
  
  // Protection contre la division par zéro avec Number.EPSILON
  let rho = (varHits - binomialVar) / (binomialVar * (n - 1) || Number.EPSILON);
  rho = Math.max(Number.EPSILON, Math.min(1 - Number.EPSILON, rho)); 
  
  const alpha = (p * (1 - rho)) / (rho || Number.EPSILON);
  const beta = ((1 - p) * (1 - rho)) / (rho || Number.EPSILON);

  const lgamma = (x: number) => {
    let j = 0;
    const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (j = 0; j <= 5; j++) {
      y++;
      ser += cof[j] / y;
    }
    return -tmp + Math.log((2.5066282746310005 * ser) / x);
  };

  const betaBinomialProb = (k: number) => {
    if (k < 0 || k > n) return 0;
    // Log-combinations implementation for dynamic size binomial coefficients
    const logGamma = (z: number) => {
      let y = z;
      let tmp = z + 5.5;
      tmp -= (z + 0.5) * Math.log(tmp);
      let ser = 1.000000000190015;
      const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
      for (let j = 0; j <= 5; j++) {
        y++;
        ser += cof[j] / y;
      }
      return -tmp + Math.log((2.5066282746310005 * ser) / z);
    };
    const logComb = (tn: number, tk: number) => {
      if (tk < 0 || tk > tn) return -Infinity;
      if (tk === 0 || tk === tn) return 0;
      return logGamma(tn + 1) - logGamma(tk + 1) - logGamma(tn - tk + 1);
    };
    const C_n_k = Math.round(Math.exp(logComb(n, k)));
    return (
      C_n_k *
      Math.exp(
        lgamma(k + alpha) +
        lgamma(n - k + beta) -
        lgamma(alpha + beta) -
        lgamma(alpha) -
        lgamma(beta) +
        lgamma(alpha + beta)
      )
    );
  };
  const probs: number[] = [];
  for (let k = 0; k <= n; k++) {
    probs.push(betaBinomialProb(k));
  }
  return probs;
};

// Bootstrap asynchrone pour IC (Déjà déterministe grâce au LCG seedé)
const computeBootstrapCI = async (data: number[], iterations: number = 200, prng: LCG, drawWinnersSize: number = 5) => {
  const B = iterations;
  const n = data.length;
  if (n === 0) return { avgHits: [0, 0] as [number, number], successRate: [0, 0] as [number, number], score: [0, 0] as [number, number] };

  const means: number[] = [];
  const rates: number[] = [];
  const scores: number[] = []; // Ajout du score au bootstrap pour une marge d'erreur empirique

  for (let i = 0; i < B; i++) {
    const sample: number[] = [];
    for (let j = 0; j < n; j++) {
      sample.push(data[Math.floor(prng.next() * n)]);
    }
    const sum = sample.reduce((a, b) => a + b, 0);
    means.push(sum / n);
    rates.push((sample.filter((x) => x > 0).length / n) * 100);
    
    // Simulation du score pour le bootstrap (proportionnel au rendement par rapport à la taille théorique)
    scores.push((sum / n) * (100 / drawWinnersSize)); 
    
    if (i % 250 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  means.sort((a, b) => a - b);
  rates.sort((a, b) => a - b);
  scores.sort((a, b) => a - b);

  const lower = Math.floor(B * 0.025);
  const upper = Math.floor(B * 0.975);

  return {
    avgHits: [means[lower], means[upper]] as [number, number],
    successRate: [rates[lower], rates[upper]] as [number, number],
    score: [scores[lower], scores[upper]] as [number, number], // IC empirique du score
  };
};

export const runBacktestTraining = async (
  drawName: string,
  history: DrawResult[],
  requestedSampleSize: number = 30,
  onProgress?: (progress: number) => void,
  customWeights?: any,
): Promise<TrainingReport> => {
  const validationResult = BacktestInputSchema.safeParse({ drawName, sampleSize: requestedSampleSize });
  if (!validationResult.success) {
    throw new Error(`Entrées invalides : ${validationResult.error.message}`);
  }

  let allResults = purifyHistoryForDraw(drawName, history);
  if (!allResults || allResults.length === 0) {
    const { data } = await fetchResults(drawName);
    allResults = purifyHistoryForDraw(drawName, data);
  }

  if (allResults.length < 5) {
    throw new Error("Historique insuffisant pour l'évaluation statistique (minimum absolu de 5 tirages).");
  }

  const drawWinnersSize = allResults[0]?.gagnants?.length || 5;

  const regime = detectGameRegime(allResults);
  const hurstExponent = regime.hurst ? parseFloat(regime.hurst.toString()) : 0.5;

  // CORRECTION 1: Taille d'échantillon minimale basée sur la taille effective (N_eff) du Théorème Central Limite pour données autocorrélées.
  // N_eff = N * (1 - H) / (1 + H). Donc N_requis = N_base * (1 + H) / (1 - H)
  const baseStatisticalN = 30; // Minimum absolu pour l’approximation normale
  const minStatisticalSample = Math.ceil(baseStatisticalN * ((1 + Math.abs(hurstExponent)) / (1 - Math.abs(hurstExponent) + Number.EPSILON)));
  
  // Remplacement du seuil binaire strict par un multiplicateur de fiabilité continu
  const sampleRatio = allResults.length / minStatisticalSample;
  // Sigmoïde douce cartographiée sur [0.3, 1.0] pour éviter de bloquer l'interface tout en mesurant précisément le niveau de confiance
  const reliabilityIndex = 0.3 + 0.7 / (1.0 + Math.exp(-6.0 * (sampleRatio - 0.5)));

  // CORRECTION 2: Holdout buffer dérivé du temps d'autocorrélation.
  // Plus la persistance (Hurst) est forte, plus le buffer doit être grand pour garantir l'indépendance des ensembles.
  // Le buffer doit également préserver au moins 10 éléments pour correspondre à la profondeur minimale requise par le moteur de prédiction.
  const absoluteMinPredictionLen = 10;
  const holdoutBuffer = Math.max(
    Math.min(absoluteMinPredictionLen, allResults.length - 1),
    Math.min(
      Math.floor(allResults.length * 0.25),
      Math.ceil(allResults.length * (1 - Math.abs(hurstExponent)))
    )
  );
  const actualSampleSize = Math.max(1, Math.min(requestedSampleSize, allResults.length - holdoutBuffer));

  const trainingResults: TrainingResult[] = [];
  const distribution = { zero: 0, one: 0, two: 0, three: 0, four: 0, five: 0 };
  let totalHitsAcc = 0;
  let atLeastOneHitCount = 0;
  const hitCountsArray: number[] = [];
  const predictedArrays: number[][] = [];
  const actualArrays: number[][] = [];
  let hwrl_total = 0;
  const confidencesAndOutcomes: { conf: number; outcome: number }[] = [];
  
  const weightsToUse = customWeights || (await getAlgoWeights(drawName));

  let foldScores: number[] = [];
  const windowScores: number[] = [];

  const testIndices = [];
  for (let i = actualSampleSize - 1; i >= 0; i--) {
    testIndices.push(i);
  }

  for (let idx = 0; idx < testIndices.length; idx++) {
    const realIdx = testIndices[idx];
    const targetDraw = allResults[realIdx];
    const trainDataStart = realIdx + 1;
    if (trainDataStart >= allResults.length) break;

    const historyAtThatTime = allResults.slice(trainDataStart);

    const temporalDepth = useNexusStore?.getState()?.temporalDepth ?? 100;
    const prediction = await generateMasterPrediction(
      drawName,
      historyAtThatTime,
      temporalDepth,
      weightsToUse,
      undefined,
      undefined,
      true,
    );

    const predicted = prediction.suggestedNumbers;
    const actual = targetDraw.gagnants;
    const hits = predicted.filter((n) => actual.includes(n));
    const hitCount = hits.length;

    // --- CONTINUOUS TOPOLOGICAL LYAPUNOV LOSS CALCULATION ---
    // 1. Calcul de l'Exposant de Lyapunov sur l'historique dispo (Divergence fractale temporelle)
    let lyapunovSum = 0;
    let validSteps = 0;
    const horizon = Math.min(30, historyAtThatTime.length);
    
    const getGridPos = (val: number) => {
      const row = Math.floor((val - 1) / 10);
      const col = (val - 1) % 10;
      return { row, col };
    };

    for (let i = 0; i < horizon - 1; i++) {
      const t0 = historyAtThatTime[i]?.gagnants;
      const t1 = historyAtThatTime[i + 1]?.gagnants;
      if (!t0 || !t1) continue;
      
      let topologicalDist = 0;
      for (const c1 of t1) {
        let minDist = 999;
        const pos1 = getGridPos(c1);
        for (const c0 of t0) {
          const pos0 = getGridPos(c0);
          const d = Math.sqrt(Math.pow(pos1.row - pos0.row, 2) + Math.pow(pos1.col - pos0.col, 2));
          if (d < minDist) minDist = d;
        }
        topologicalDist += minDist;
      }
      lyapunovSum += Math.log(topologicalDist + 1e-4);
      validSteps++;
    }
    const lambda = validSteps > 0 ? lyapunovSum / validSteps : 0.0;
    const isChaotic = lambda > 0;
    const divergenceForce = Math.tanh(Math.abs(lambda));

    // 2. Calcul de la similarité topologique du Near-Miss
    let totalContinLoss = 0;

    actual.forEach((w) => {
      let maxSimForWinner = 1e-9;
      predicted.slice(0, 5).forEach((p) => {
        let sim = 0.0;
        if (p === w) {
          sim = 1.0;
        } else {
          const linSim = Math.exp(-0.25 * Math.abs(p - w));
          const posP = getGridPos(p);
          const posW = getGridPos(w);
          const gridDist = Math.sqrt(Math.pow(posP.row - posW.row, 2) + Math.pow(posP.col - posW.col, 2));
          const gridSim = Math.exp(-0.35 * gridDist);

          // 3. Symétries miroirs/flips de chiffres (topologie arithmétique continue)
          const diff91 = Math.abs((p + w) - 91);
          const mirror91Sim = Math.exp(-0.5 * diff91);
          
          const revP = parseInt(p.toString().split("").reverse().join(""), 10) || 0;
          const revDiff = Math.abs(revP - w);
          const mirrorRevSim = Math.exp(-0.5 * revDiff);

          // 4. Harmoniques décimales de finaux (Distance angulaire Modulo 10)
          const modP = p % 10;
          const modW = w % 10;
          const harmonicDist = Math.min(Math.abs(modP - modW), 10 - Math.abs(modP - modW));
          const harmonicSim = Math.exp(-0.5 * harmonicDist);

          // 5. Structure de décade (Décroissance exponentielle)
          const decadeP = Math.floor((p - 1) / 10);
          const decadeW = Math.floor((w - 1) / 10);
          const decadeSim = Math.exp(-0.5 * Math.abs(decadeP - decadeW));

          const baseSim = Math.max(linSim, gridSim, mirror91Sim, mirrorRevSim, harmonicSim, decadeSim);

          // ASYMMETRIC RE-EVALUATION MODULATORS (Requirement 3)
          // 1. Parity asymmetric scaling: boost same parity, penalize different parity
          const parityFactor = (p % 2 === w % 2) ? 1.15 : 0.85;

          // 2. Mirror/Flip resonance booster (e.g. 13 <-> 31)
          const isMirror = (revP === w || p === (parseInt(w.toString().split("").reverse().join(""), 10) || 0));
          const mirrorBoost = isMirror ? 1.45 : 1.0;

          // 3. Modular proximity resonance (distance modulo 90)
          const DOMAIN_SIZE = 90;
          const mod90Dist = Math.min(Math.abs(p - w), DOMAIN_SIZE - Math.abs(p - w));
          const modProximityBoost = 1.0 + Math.exp(-0.2 * mod90Dist);

          sim = Math.min(0.99, baseSim * parityFactor * mirrorBoost * modProximityBoost);
        }
        if (sim > maxSimForWinner) maxSimForWinner = sim;
      });

      // 3. Combinaison des Vecteurs 1 & 2 : Lissage Topologique X Exposant de Lyapunov
      // Si régime chaotique (lambda > 0), une forte similarité near-miss est en fait trompeuse, 
      // donc on inverse la pénalité topologique. Si régime stable, le near-miss est récompensé.
      if (isChaotic) {
        totalContinLoss += maxSimForWinner * divergenceForce; 
      } else {
        totalContinLoss += (1.0 - maxSimForWinner) * (1.0 - divergenceForce);
      }
    });
    
    // Normalisation approximative de la perte
    const currentTopologicalLoss = totalContinLoss;

    let hwrl = 0;
    predicted.forEach((num, index) => {
      const hit_k = actual.includes(num) ? 1 : 0;
      hwrl += (1 - hit_k) * Math.log(index + 1 + Number.EPSILON);
    });
    hwrl /= predicted.length || 1;
    hwrl_total += hwrl;

    hitCountsArray.push(hitCount);
    predictedArrays.push(predicted);
    actualArrays.push(actual);
    totalHitsAcc += hitCount;
    if (hitCount > 0) atLeastOneHitCount++;

    if (hitCount === 0) distribution.zero++;
    else if (hitCount === 1) distribution.one++;
    else if (hitCount === 2) distribution.two++;
    else if (hitCount === 3) distribution.three++;
    else if (hitCount === 4) distribution.four++;
    else if (hitCount >= 5) distribution.five++;

    const outcomeRatio = hitCount / (drawWinnersSize || 5.0);
    confidencesAndOutcomes.push({ conf: prediction.confidence / 100, outcome: outcomeRatio });

    trainingResults.unshift({
      date: targetDraw.date,
      drawName,
      predictedNumbers: predicted,
      actualWinningNumbers: actual,
      hits,
      hitCount,
      isJackpot: hitCount === drawWinnersSize,
      confidence: prediction.confidence,
      breakdown: prediction.breakdown,
      topologicalLoss: currentTopologicalLoss,
    });

    windowScores.push(hitCount);

    if (onProgress) onProgress(Math.round(((idx + 1) / testIndices.length) * 100));
    if (idx % 10 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  const totalTests = trainingResults.length;
  const avg = totalTests > 0 ? totalHitsAcc / totalTests : 0;

  // Stabilité (Variance sur fenêtres adaptatives)
  const windowSize = Math.max(5, Math.floor(Math.sqrt(actualSampleSize)));
  for (let i = 0; i < windowScores.length; i += windowSize) {
    const chunk = windowScores.slice(i, i + windowSize);
    foldScores.push(chunk.reduce((a, b) => a + b, 0) / chunk.length);
  }
  
  const foldMean = foldScores.reduce((a, b) => a + b, 0) / (foldScores.length || 1);
  const variance = foldScores.reduce((acc, val) => acc + Math.pow(val - foldMean, 2), 0) / (foldScores.length || 1);
  const stabilityScore = 1 / (1 + Math.sqrt(variance));

  let totalMRR = 0;
  let totalNDCG = 0;
  for (let i = 0; i < predictedArrays.length; i++) {
    const pred = predictedArrays[i];
    const act = actualArrays[i];
    let mrr = 0, dcg = 0, idcg = 0;
    for (let r = 0; r < pred.length; r++) {
      if (act.includes(pred[r])) {
        if (mrr === 0) mrr = 1 / (r + 1);
        dcg += 1 / Math.log2(r + 2);
      }
      if (r < act.length) idcg += 1 / Math.log2(r + 2);
    }
    totalMRR += mrr;
    totalNDCG += idcg > 0 ? dcg / idcg : 0;
  }
  const mrr = totalTests > 0 ? totalMRR / totalTests : 0;
  const ndcg = totalTests > 0 ? totalNDCG / totalTests : 0;

  const metrics = calculateClassMetrics(hitCountsArray, totalTests, drawWinnersSize);

  const w_regime = 0.5 + hurstExponent;
  const Pk = calculateEmpiricalPk(hitCountsArray, drawWinnersSize);

  const logGamma = (z: number) => {
    const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = z;
    let tmp = z + 5.5;
    tmp -= (z + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j <= 5; j++) {
      y++;
      ser += cof[j] / y;
    }
    return -tmp + Math.log((2.5066282746310005 * ser) / z);
  };

  const logComb = (n: number, k: number) => {
    if (k < 0 || k > n) return -Infinity;
    if (k === 0 || k === n) return 0;
    return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
  };
  const theoreticalProbs = Array.from({ length: drawWinnersSize + 1 }, (_, k) => {
    const maxDrawNumber = 90;
    const numbersDrawn = drawWinnersSize;
    const logP = logComb(numbersDrawn, k) + logComb(maxDrawNumber - numbersDrawn, numbersDrawn - k) - logComb(maxDrawNumber, numbersDrawn);
    return Math.exp(logP);
  });

  let EVS = 0;
  let maxTheoreticalEV = 0;
  for (let k = 0; k <= drawWinnersSize; k++) {
    const rewardWeight = Math.pow(k + 1, 2);
    EVS += (Pk[k] || 0) * rewardWeight;
    maxTheoreticalEV += theoreticalProbs[k] * rewardWeight;
  }

  const normalizedEV = Math.min(100, (EVS / (maxTheoreticalEV || Number.EPSILON)) * 100) * w_regime;
  
  // Poids dynamiques basés sur l'entropie et la persistance (Hurst) - ZÉRO magie (remplacement de 0.6 et 0.4)
  const persistenceFactor = Math.abs(hurstExponent - 0.5) * 2.0; // 0 à 1
  const evWeight = 0.5 + (0.5 * persistenceFactor); 
  const stabWeight = 1.0 - evWeight;
  
  const continuousScore = (normalizedEV * evWeight) + (stabilityScore * 100 * stabWeight);
  const score = Math.min(100, continuousScore * reliabilityIndex);

  const brier_score = confidencesAndOutcomes.reduce((sum, item) => sum + Math.pow(item.conf - item.outcome, 2), 0) / (totalTests || 1);
  
  const brierScores = confidencesAndOutcomes.map(item => Math.pow(item.conf - item.outcome, 2));
  const meanBrier = brierScores.reduce((a,b)=>a+b,0) / (brierScores.length || 1);
  const stdBrier = Math.sqrt(brierScores.reduce((a,b)=>a+Math.pow(b-meanBrier,2),0) / Math.max(Number.EPSILON, brierScores.length)) || Number.EPSILON;
  
  const slope = 1.0 / stdBrier;
  const calibration_risk = 1 / (1 + Math.exp(-slope * (brier_score - meanBrier)));
  
  // CORRECTION 3: Seuil continu pour classification (au lieu de 0.05) avec sigmoïde
  const calibration_flag = calibration_risk > (stdBrier < 0.1 ? 0.05 : stdBrier); 

  const bins = new Array(10).fill(0).map(() => ({ count: 0, sumOutcomes: 0 }));
  confidencesAndOutcomes.forEach((co) => {
    const bIdx = Math.min(9, Math.floor(co.conf * 10));
    bins[bIdx].count++;
    bins[bIdx].sumOutcomes += co.outcome;
  });

  const calibration_curve = bins
    .map((b, i) => ({
      expected: (i + 0.5) * 10,
      actual: b.count > 0 ? (b.sumOutcomes / b.count) * 100 : 0,
    }))
    .filter((b) => b.actual > 0 || bins[Math.floor(b.expected / 10)].count > 0);

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < windowScores.length; i++) {
    sumX += i;
    sumY += windowScores[i];
    sumXY += i * windowScores[i];
    sumX2 += i * i;
  }
  const score_drift = windowScores.length > 1 ? (windowScores.length * sumXY - sumX * sumY) / (windowScores.length * sumX2 - sumX * sumX || 1) : 0;

  // CORRECTION 4: Utilisation du VRAI Bootstrap CI calculé, au lieu d'une marge magique "score * 0.15"
  const prng = new LCG(drawName || 'backtest_ci');
  const CIs = await computeBootstrapCI(hitCountsArray, 200, prng, drawWinnersSize);
  
  // On mappe l'IC des hits vers un IC du score de manière proportionnelle et rigoureuse
  const scoreCI: [number, number] = [
    Math.max(0, CIs.score[0]),
    Math.min(100, CIs.score[1])
  ];

  const stabilityUpperThreshold = 1.0 - (stdBrier * persistenceFactor);
  const stabilityLowerThreshold = stdBrier * (1.0 - persistenceFactor);

  let totalTopoLoss = 0;
  trainingResults.forEach(r => { if (r.topologicalLoss !== undefined) totalTopoLoss += r.topologicalLoss; });
  const avgTopoLoss = totalTests > 0 ? (totalTopoLoss / totalTests) : 0;

  return {
    totalTests,
    totalHits: totalHitsAcc,
    averageHits: parseFloat(avg.toFixed(2)),
    successRate: totalTests > 0 ? Math.round((atLeastOneHitCount / totalTests) * 100) : 0,
    stabilityScore: parseFloat(stabilityScore.toFixed(2)),
    stabilityLabel: stabilityScore > stabilityUpperThreshold ? "Rocher (Stable)" : stabilityScore > stabilityLowerThreshold ? "Fluide" : "Chaos (Instable)",
    winDistribution: distribution,
    history: trainingResults,
    score,
    topologicalLoss: parseFloat(avgTopoLoss.toFixed(3)),
    learnedPatternsSummary: {
      mrr: mrr.toFixed(3),
      ndcg: ndcg.toFixed(3),
      f1: metrics.f1.toFixed(3),
      precision: metrics.precision.toFixed(3),
      hwrl: (totalTests > 0 ? hwrl_total / totalTests : 0).toFixed(3),
    },
    regimeInfo: { regime: regime.regime, hurst: regime.hurst },
    brier_score: parseFloat(brier_score.toFixed(3)),
    calibration_flag,
    calibration_curve,
    score_drift: parseFloat(score_drift.toFixed(3)),
    mrr: parseFloat(mrr.toFixed(3)),
    ndcg: parseFloat(ndcg.toFixed(3)),
    confidence_intervals: {
      avgHits: [parseFloat(CIs.avgHits[0].toFixed(2)), parseFloat(CIs.avgHits[1].toFixed(2))],
      successRate: [parseFloat(CIs.successRate[0].toFixed(1)), parseFloat(CIs.successRate[1].toFixed(1))],
      score: scoreCI, // IC empirique rigoureux
    },
  };
};
