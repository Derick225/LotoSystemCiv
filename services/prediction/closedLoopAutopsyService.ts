import { DrawResult, AlgoWeights } from '../../types';
import { AlgoKey } from '../../shared/prediction.types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { extractFeatures, extractDrawNumbers } from './featureExtractor';
import { computeAdvancedMetrics } from './predictionOrchestrator';
import { algorithmRegistry, AlgorithmContext } from './algorithmRegistry';
import { calculateStatisticalBounds, calculateTemporalDriftLearningRate, TemporalDriftLearningRateResult } from '../mathService';
import { normalizeWeights } from './weightsManager';
import { LABELS_MAP } from '../../hooks/useAlgorithmSync';
import { calculateCyclicPhaseProfileMatrix, CyclicPhaseProfileResult } from './dynamicProfileMatrix';
import { parseDateSafely } from '../../utils/dateUtils';

export interface NearMissItem {
  actualWinner: number;
  closestPredicted: number;
  distance: number;
  type: 'neighbor_1' | 'neighbor_2' | 'mirror' | 'complementary_90';
  description: string;
}

export interface AlgoGradientBreakdown {
  key: AlgoKey;
  label: string;
  currentWeight: number;
  gradient: number; // Erreur relative (positif = sous-performant, négatif = sur-performant)
  predictedScoreSum: number;
  attributionToWinners: number;
  recommendedWeight: number;
  deltaPercent: number;
}

export interface ClosedLoopAutopsyReport {
  drawName: string;
  targetDrawDate: string;
  actualWinners: number[];
  actualMachine: number[];
  top5Predicted: number[];
  top10Predicted: number[];
  top20Predicted: number[];
  directHitsTop5: number[];
  directHitsTop10: number[];
  directHitsTop20: number[];
  nearMisses: NearMissItem[];
  klDivergence: number;
  crossEntropy: number;
  brierScore: number;
  calibrationAccuracy: number; // 0 - 100%
  algoGradients: AlgoGradientBreakdown[];
  correctedWeights: AlgoWeights;
  initialWeights: AlgoWeights;
  learningRate: number;
  summaryRemark: string;
  cyclicPhaseProfile?: CyclicPhaseProfileResult;
  temporalDriftMetrics?: TemporalDriftLearningRateResult;
}

/**
 * Miroir décimal déterministe (ex: 14 -> 41, 28 -> 82, 3 -> 30)
 */
const getMirrorNumber = (n: number): number => {
  if (n < 10) return n * 10 <= 90 ? n * 10 : n;
  const s = String(n);
  const rev = Number(s.split('').reverse().join(''));
  return !isNaN(rev) && rev >= 1 && rev <= 90 ? rev : n;
};

/**
 * Calculateur d'Autopsie en Boucle Fermée & Rétropropagation Déterministe
 */
export const executeClosedLoopAutopsy = async (
  drawName: string,
  targetDrawIndex: number = 0,
  rawHistory: DrawResult[],
  currentWeights: AlgoWeights
): Promise<ClosedLoopAutopsyReport> => {
  const history = purifyHistoryForDraw(drawName, rawHistory);
  if (history.length < 3) {
    throw new Error(`Historique insuffisant pour l'autopsie en boucle fermée (${history.length} tirages trouvés).`);
  }

  const targetDraw = history[targetDrawIndex] || history[0];
  const priorHistory = history.slice(targetDrawIndex + 1);

  if (priorHistory.length < 2) {
    throw new Error(`Historique antérieur insuffisant pour reconstituer la prédiction rétrospective.`);
  }

  const { winners: actualWinners, machine: actualMachine } = extractDrawNumbers(targetDraw);
  const actualWinnersSet = new Set(actualWinners);

  // 1. Reconstitution du contexte de prédiction à l'instant t-1
  const features = await extractFeatures(drawName, priorHistory);
  const bounds = calculateStatisticalBounds(priorHistory);
  const advancedMetrics = await computeAdvancedMetrics(
    priorHistory,
    drawName,
    {},
    false,
    undefined
  );

  const context: AlgorithmContext = {
    features,
    advancedMetrics,
    history: priorHistory,
    weights: { ...currentWeights },
    algoWeights: { ...currentWeights },
    statisticalBounds: bounds,
    deterministicSeed: parseDateSafely(targetDraw.date).getTime(),
    drawName,
    pluginCache: {},
  };

  // Précalcul des plugins
  algorithmRegistry.forEach((plugin) => {
    try {
      if (typeof plugin.precompute === 'function') {
        plugin.precompute(context);
      }
    } catch {
      // Ignorer
    }
  });

  const validKeys = Object.values(AlgoKey);
  const numAlgos = validKeys.length;
  const normalizedCurrent = normalizeWeights(currentWeights);

  // 2. Évaluation individuelle de chaque algorithme pour les 90 numéros
  const algoScores: Record<string, Float32Array> = {};
  const ensembleScores = new Float32Array(91);

  validKeys.forEach((k) => {
    algoScores[k] = new Float32Array(91);
  });

  for (let num = 1; num <= 90; num++) {
    let combinedScore = 0;

    algorithmRegistry.forEach((plugin) => {
      if (!validKeys.includes(plugin.key)) return;
      try {
        const res = plugin.evaluate(num, context);
        const s = typeof res.score === 'number' && !isNaN(res.score) ? Math.max(0, Math.min(1, res.score)) : 0;
        algoScores[plugin.key][num] = s;
        combinedScore += s * (normalizedCurrent[plugin.key] || (1 / numAlgos));
      } catch {
        algoScores[plugin.key][num] = 0;
      }
    });

    ensembleScores[num] = combinedScore;
  }

  // 3. Normalisation des distributions de probabilité (Softmax / L1)
  let sumEnsemble = 0;
  for (let i = 1; i <= 90; i++) sumEnsemble += ensembleScores[i];
  const probEnsemble = new Float32Array(91);
  for (let i = 1; i <= 90; i++) probEnsemble[i] = ensembleScores[i] / (sumEnsemble || 1.0);

  // 4. Classement rétrospectif
  const rankedNumbers = Array.from({ length: 90 }, (_, i) => ({
    num: i + 1,
    score: ensembleScores[i + 1],
    prob: probEnsemble[i + 1],
  })).sort((a, b) => b.score - a.score);

  const top5Predicted = rankedNumbers.slice(0, 5).map((r) => r.num);
  const top10Predicted = rankedNumbers.slice(0, 10).map((r) => r.num);
  const top20Predicted = rankedNumbers.slice(0, 20).map((r) => r.num);

  const directHitsTop5 = top5Predicted.filter((n) => actualWinnersSet.has(n));
  const directHitsTop10 = top10Predicted.filter((n) => actualWinnersSet.has(n));
  const directHitsTop20 = top20Predicted.filter((n) => actualWinnersSet.has(n));

  // 5. Calcul des Near-Misses (Frôlements mathématiques)
  const nearMisses: NearMissItem[] = [];
  const top10Set = new Set(top10Predicted);

  actualWinners.forEach((w) => {
    if (top5Predicted.includes(w)) return; // Hit exact déjà comptabilisé

    // Voisin +/- 1
    if (top10Set.has(w - 1)) {
      nearMisses.push({
        actualWinner: w,
        closestPredicted: w - 1,
        distance: 1,
        type: 'neighbor_1',
        description: `Frôlement immédiat -1 : Gagnant ${w} vs Prédit ${w - 1}`,
      });
    } else if (top10Set.has(w + 1)) {
      nearMisses.push({
        actualWinner: w,
        closestPredicted: w + 1,
        distance: 1,
        type: 'neighbor_1',
        description: `Frôlement immédiat +1 : Gagnant ${w} vs Prédit ${w + 1}`,
      });
    } else if (top10Set.has(w - 2)) {
      nearMisses.push({
        actualWinner: w,
        closestPredicted: w - 2,
        distance: 2,
        type: 'neighbor_2',
        description: `Déviation spatiale -2 : Gagnant ${w} vs Prédit ${w - 2}`,
      });
    } else if (top10Set.has(w + 2)) {
      nearMisses.push({
        actualWinner: w,
        closestPredicted: w + 2,
        distance: 2,
        type: 'neighbor_2',
        description: `Déviation spatiale +2 : Gagnant ${w} vs Prédit ${w + 2}`,
      });
    }

    // Miroir
    const mirror = getMirrorNumber(w);
    if (mirror !== w && top10Set.has(mirror)) {
      nearMisses.push({
        actualWinner: w,
        closestPredicted: mirror,
        distance: Math.abs(w - mirror),
        type: 'mirror',
        description: `Résonance miroir : Gagnant ${w} vs Prédit miroir ${mirror}`,
      });
    }

    // Complémentaire 90
    const comp90 = 91 - w;
    if (comp90 !== w && top10Set.has(comp90)) {
      nearMisses.push({
        actualWinner: w,
        closestPredicted: comp90,
        distance: Math.abs(w - comp90),
        type: 'complementary_90',
        description: `Symétrie 90 : Gagnant ${w} vs Symétrique ${comp90}`,
      });
    }
  });

  // 6. Métriques d'Entropie Croisée & Divergence KL
  let klDiv = 0;
  let crossEnt = 0;
  let brierSum = 0;
  const pActualUniformOnWinners = 1.0 / (actualWinners.length || 5);

  for (let num = 1; num <= 90; num++) {
    const isWinner = actualWinnersSet.has(num);
    const pPred = Math.max(1e-6, probEnsemble[num]);
    const pTarget = isWinner ? pActualUniformOnWinners : 0;

    if (isWinner) {
      klDiv += pTarget * Math.log((pTarget + 1e-9) / pPred);
      crossEnt -= pTarget * Math.log(pPred);
    }
    brierSum += Math.pow(pPred - (isWinner ? 1 : 0), 2);
  }

  const brierScore = brierSum / 90.0;
  const calibrationAccuracy = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-brierScore * 20.0))));

  // 7. Calibration Dynamique du Taux d'Apprentissage η(t) par Dérive Temporelle
  // Formule canonique : η(t) = η0 / (1 + λ * D_KL(P || Q))
  const baseLR = 0.25 / (1.0 + Math.exp(5.0 * (brierScore - 0.05)));
  const temporalDriftMetrics = calculateTemporalDriftLearningRate(priorHistory, baseLR, 10);
  const learningRate = Math.max(0.02, Math.min(0.5, temporalDriftMetrics.learningRate));

  // 7.5. Matrice de Profil Cyclique & Exposant de Lyapunov
  const cyclicPhaseProfile = calculateCyclicPhaseProfileMatrix(
    priorHistory,
    advancedMetrics?.topologicalLyapunov as Record<number, number>
  );

  const algoGradients: AlgoGradientBreakdown[] = [];
  const rawUpdatedWeights: Record<string, number> = {};

  validKeys.forEach((key) => {
    const scores = algoScores[key];
    let sumScore = 0;
    for (let i = 1; i <= 90; i++) sumScore += scores[i];
    const meanScore = sumScore / 90.0;

    let attributionWinners = 0;
    let totalTargetMass = 0;
    actualWinners.forEach((w) => {
      // 1. Impact direct exact (Hit exact : distance = 0, masse = 1.0)
      attributionWinners += scores[w] || 0;
      totalTargetMass += 1.0;

      // 2. Intégration continue des frôlements spatiaux (Voisins immédiats +/- 1 sur tore circulaire)
      const neighborMinus = w > 1 ? w - 1 : 90;
      const neighborPlus = w < 90 ? w + 1 : 1;
      const neighborGaussWeight = Math.exp(-0.5); // Noyau gaussien continu exp(-d^2/(2*sigma^2))
      attributionWinners += (scores[neighborMinus] || 0) * neighborGaussWeight * 0.25;
      attributionWinners += (scores[neighborPlus] || 0) * neighborGaussWeight * 0.25;
      totalTargetMass += neighborGaussWeight * 0.5;

      // 3. Résonance miroir décadaire
      const mirror = getMirrorNumber(w);
      if (mirror !== w) {
        const mirrorWeight = Math.exp(-1.0) * 0.2;
        attributionWinners += (scores[mirror] || 0) * mirrorWeight;
        totalTargetMass += mirrorWeight;
      }
    });
    const avgWinnerScore = attributionWinners / (totalTargetMass || 1);

    // Gradient différentiel : gain relatif sur les gagnants vs bruit sur le reste
    const signalGain = avgWinnerScore - meanScore;
    const gradient = -signalGain; // Négatif si le gène a fortement distingué les gagnants

    // Modulation continue selon la phase cyclique du jeu
    const phaseModifier = cyclicPhaseProfile.algoWeightModifiers[key] || 0.0;
    const phaseMultiplier = Math.exp(phaseModifier * 0.5);

    // Mise à jour exponentielle (Softmax SGD) régularisée par la résistance de dérive
    const currentW = normalizedCurrent[key] || (1.0 / numAlgos);
    const updateMultiplier = Math.exp(-learningRate * gradient * 4.0) * phaseMultiplier;
    const newWeight = currentW * updateMultiplier;
    rawUpdatedWeights[key] = newWeight;

    algoGradients.push({
      key,
      label: LABELS_MAP[key] || key,
      currentWeight: currentW,
      gradient,
      predictedScoreSum: sumScore,
      attributionToWinners: avgWinnerScore,
      recommendedWeight: newWeight,
      deltaPercent: 0,
    });
  });

  const hasMachineData = priorHistory.some((d) => Array.isArray(d.machine) && d.machine.length > 0);
  if (!hasMachineData) {
    (rawUpdatedWeights as any)[AlgoKey.MACHINE_TRANSFER] = 0.0;
  }

  const correctedWeights = normalizeWeights(rawUpdatedWeights as AlgoWeights);

  algoGradients.forEach((g) => {
    g.recommendedWeight = correctedWeights[g.key] || (1.0 / numAlgos);
    g.deltaPercent = ((g.recommendedWeight - g.currentWeight) / g.currentWeight) * 100;
  });

  // Tri par attribution décroissante
  algoGradients.sort((a, b) => b.attributionToWinners - a.attributionToWinners);

  // 8. Synthèse Narrative Enrichie
  let summaryRemark = `Autopsie rétrospective du ${targetDraw.date} (${cyclicPhaseProfile.phaseLabel}) : `;
  if (directHitsTop5.length >= 2) {
    summaryRemark += `Excellente résonance prédictive avec ${directHitsTop5.length} gagnants capturés directement dans le Top 5 (${directHitsTop5.join(', ')}). `;
  } else if (directHitsTop10.length >= 2) {
    summaryRemark += `Convergence solide : ${directHitsTop10.length} numéros détectés dans le Top 10 (${directHitsTop10.join(', ')}). `;
  } else {
    summaryRemark += `Dispersion stochastique modérée. ${nearMisses.length} frôlements spatiaux/miroirs identifiés (${nearMisses.slice(0, 2).map((m) => m.actualWinner).join(', ')}). `;
  }
  summaryRemark += `Taux d'apprentissage η(t) = ${(learningRate * 100).toFixed(2)}% (Résistance dérive: ${(temporalDriftMetrics.driftResistanceFactor * 100).toFixed(1)}%). `;
  summaryRemark += `Gènes leaders sur ce tirage : ${algoGradients.slice(0, 3).map((g) => g.label).join(', ')}.`;

  return {
    drawName,
    targetDrawDate: targetDraw.date,
    actualWinners,
    actualMachine,
    top5Predicted,
    top10Predicted,
    top20Predicted,
    directHitsTop5,
    directHitsTop10,
    directHitsTop20,
    nearMisses,
    klDivergence: klDiv,
    crossEntropy: crossEnt,
    brierScore,
    calibrationAccuracy,
    algoGradients,
    correctedWeights,
    initialWeights: normalizedCurrent,
    learningRate,
    summaryRemark,
    cyclicPhaseProfile,
    temporalDriftMetrics,
  };
};
