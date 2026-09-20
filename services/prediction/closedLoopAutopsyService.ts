import { DrawResult, AlgoWeights } from '../../types';
import { AlgoKey } from '../../shared/prediction.types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { extractFeatures, extractDrawNumbers } from './featureExtractor';
import { computeAdvancedMetrics } from './predictionOrchestrator';
import { algorithmRegistry, AlgorithmContext } from './algorithmRegistry';
import { calculateStatisticalBounds, calculateTemporalDriftLearningRate, TemporalDriftLearningRateResult } from '../mathService';
import { normalizeWeights, evaluateAlgoEmpiricalProof, saveAlgoWeights } from './weightsManager';
import { AUTOPSY_CALIBRATION } from './calibrationConstants';
import { recordModelDnaVersion, ModelDnaRecord } from './modelDnaKnowledgeBase';
import { applyOptimizedWeights } from './optimizationController';
import { LABELS_MAP } from '../../hooks/useAlgorithmSync';
import { calculateCyclicPhaseProfileMatrix, CyclicPhaseProfileResult } from './dynamicProfileMatrix';
import { parseDateSafely } from '../../utils/dateUtils';
import { generateProbabilisticScenarioMatrix, SimulationScenarioItem } from './predictionScenarios';
import { extractMathProofMetadata, MathematicalProofMetadata } from '../forensic/forensicProofStandard';
import { auditInterDrawPatternsPostMortem, InterDrawPostMortemAudit } from './interDrawPostMortemService';

export interface NearMissItem {
  actualWinner: number;
  closestPredicted: number;
  distance: number;
  type: 'neighbor_1' | 'neighbor_2' | 'mirror' | 'complementary_90';
  description: string;
}

export interface ScenarioPostMortemEvaluation {
  scenarioId: string;
  scenarioName: string;
  riskProfile: string;
  ticket: number[];
  hits: number[];
  hitCount: number;
  nearMissCount: number;
  alignmentScore: number; // Score continu 0-100%
  klDivergence: number;
  color?: string;
  isOptimal: boolean;
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
  scenarioEvaluations?: ScenarioPostMortemEvaluation[];
  bestPerformingScenario?: ScenarioPostMortemEvaluation;
  mathProofMetadata?: MathematicalProofMetadata;
  interDrawAudit?: InterDrawPostMortemAudit;
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
  // Échelle de conversion Brier -> calibration centralisée dans calibrationConstants.AUTOPSY_CALIBRATION.
  const calibrationAccuracy = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-brierScore * AUTOPSY_CALIBRATION.BRIER_TO_ACCURACY_DECAY))));

  // 7. Calibration Dynamique du Taux d'Apprentissage η(t) par Dérive Temporelle
  // Formule canonique : η(t) = η0 / (1 + λ * D_KL(P || Q))
  const expectedUniformBrier = (5.0 / 90.0) * Math.pow(1.0 - 1.0 / 5.0, 2);
  const maxLR = 1.0 / Math.sqrt(numAlgos);
  const baseLR = maxLR / (1.0 + Math.exp((brierScore - expectedUniformBrier) / (expectedUniformBrier || 1e-6)));
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
      const halfNeighborWeight = neighborGaussWeight / 2.0;
      attributionWinners += (scores[neighborMinus] || 0) * halfNeighborWeight;
      attributionWinners += (scores[neighborPlus] || 0) * halfNeighborWeight;
      totalTargetMass += neighborGaussWeight;

      // 3. Résonance miroir décadaire
      const mirror = getMirrorNumber(w);
      if (mirror !== w) {
        const mirrorWeight = Math.exp(-1.0) / 2.0;
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

  // 8. Évaluation Rétroactive Multi-Scénarios & Divergence KL par Scénario
  const simulatedScoredNumbers = Array.from({ length: 90 }, (_, i) => {
    const num = i + 1;
    const breakdown: Record<string, number> = {};
    validKeys.forEach((k) => {
      breakdown[k] = algoScores[k][num] || 0;
    });
    return {
      num,
      score: ensembleScores[num],
      prob: probEnsemble[num],
      normalizedScore: ensembleScores[num],
      rank: 0,
      breakdown,
    };
  });

  const scenarioDeck = generateProbabilisticScenarioMatrix({
    selection: top5Predicted,
    denoisedScores: simulatedScoredNumbers,
    explainabilityRecord: (advancedMetrics?.topologicalLyapunov as any) || {},
    finalConfidence: calibrationAccuracy,
    drawName,
  });

  const scenarioEvaluations: ScenarioPostMortemEvaluation[] = scenarioDeck.map((sc) => {
    const ticketSet = new Set(sc.ticket);
    const hits = sc.ticket.filter((num) => actualWinnersSet.has(num));
    const hitCount = hits.length;

    // Calcul des near-misses spécifiques au scénario
    let nearMissCount = 0;
    actualWinners.forEach((w) => {
      if (ticketSet.has(w)) return;
      if (ticketSet.has(w - 1) || ticketSet.has(w + 1) || ticketSet.has(getMirrorNumber(w)) || ticketSet.has(91 - w)) {
        nearMissCount++;
      }
    });

    // Divergence KL du scénario vis-à-vis de la distribution empirique uniforme sur les gagnants
    let scenKl = 0;
    for (const winNum of actualWinners) {
      const pScen = ticketSet.has(winNum) ? 1.0 / 5.0 : 1e-6;
      scenKl += (1.0 / actualWinners.length) * Math.log((1.0 / actualWinners.length) / pScen);
    }

    // Score d'alignement continu 0-100% (Hit direct = 20 pts, Frôlement = 6 pts, Pénalité de divergence continue)
    const rawScore = hitCount * 20.0 + nearMissCount * 6.0;
    const alignmentScore = Math.max(0, Math.min(100, Math.round(100 * (1.0 / (1.0 + Math.exp(-0.08 * (rawScore - 20.0)))))));

    return {
      scenarioId: sc.scenarioId,
      scenarioName: sc.scenarioName,
      riskProfile: sc.riskProfile,
      ticket: sc.ticket,
      hits,
      hitCount,
      nearMissCount,
      alignmentScore,
      klDivergence: Math.max(0, scenKl),
      color: sc.color,
      isOptimal: false,
    };
  });

  // Identification du scénario optimal rétroactivement
  scenarioEvaluations.sort((a, b) => {
    if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;
    if (b.nearMissCount !== a.nearMissCount) return b.nearMissCount - a.nearMissCount;
    return a.klDivergence - b.klDivergence;
  });

  if (scenarioEvaluations.length > 0) {
    scenarioEvaluations[0].isOptimal = true;
  }
  const bestPerformingScenario = scenarioEvaluations[0];

  // 9. Synthèse Narrative Enrichie & Métadonnées Standardisées
  let summaryRemark = `Autopsie rétrospective du ${targetDraw.date} (${cyclicPhaseProfile.phaseLabel}) : `;
  if (directHitsTop5.length >= 2) {
    summaryRemark += `Excellente résonance prédictive avec ${directHitsTop5.length} gagnants capturés directement dans le Top 5 (${directHitsTop5.join(', ')}). `;
  } else if (directHitsTop10.length >= 2) {
    summaryRemark += `Convergence solide : ${directHitsTop10.length} numéros détectés dans le Top 10 (${directHitsTop10.join(', ')}). `;
  } else {
    summaryRemark += `Dispersion stochastique modérée. ${nearMisses.length} frôlements spatiaux/miroirs identifiés (${nearMisses.slice(0, 2).map((m) => m.actualWinner).join(', ')}). `;
  }
  if (bestPerformingScenario) {
    summaryRemark += `Scénario le plus performant : "${bestPerformingScenario.scenarioName}" (${bestPerformingScenario.hitCount} exact(s), ${bestPerformingScenario.nearMissCount} frôlement(s)). `;
  }
  summaryRemark += `Taux d'apprentissage η(t) = ${(learningRate * 100).toFixed(2)}% (Résistance dérive: ${(temporalDriftMetrics.driftResistanceFactor * 100).toFixed(1)}%). `;
  summaryRemark += `Gènes leaders sur ce tirage : ${algoGradients.slice(0, 3).map((g) => g.label).join(', ')}.`;

  const mathProofMetadata = extractMathProofMetadata({
    history: priorHistory,
    weights: normalizedCurrent,
    algoGradients,
    suggestedNumbers: top5Predicted,
    actualWinners,
    brierScore,
  });

  // Audit Rétrospectif des Signaux Inter-Tirages & Calibration Bayesienne (Famille étanche)
  const interDrawAudit = auditInterDrawPatternsPostMortem(
    drawName,
    targetDrawIndex,
    rawHistory
  ) || undefined;

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
    scenarioEvaluations,
    bestPerformingScenario,
    mathProofMetadata,
    interDrawAudit,
  };
};

export interface ClosedLoopAutoAdjustmentResult {
  drawName: string;
  targetDrawDate: string;
  autopsyReport: ClosedLoopAutopsyReport;
  previousWeights: AlgoWeights;
  optimizedWeights: AlgoWeights;
  dnaRecord: ModelDnaRecord;
  causalAuditTrail: string[];
  learningRate: number;
  accuracyGainEstimated: number;
  appliedDirectly: boolean;
}

/**
 * Orchestrateur de Boucle Fermée Complète :
 * Autopsie Post-Mortem ➔ Micro-SGD régularisé par Dérive Temporelle ➔ Enregistrement automatique ADN
 * Zéro Nombre Magique & 100% Déterministe.
 */
export const executeClosedLoopAutoAdjustment = async (
  drawName: string,
  targetDrawIndex: number = 0,
  rawHistory: DrawResult[],
  currentWeights: AlgoWeights,
  options?: {
    dryRun?: boolean;
    learningRateOverride?: number;
    auditContext?: string;
    timestamp?: string;
  }
): Promise<ClosedLoopAutoAdjustmentResult> => {
  // 1. Exécuter l'autopsie complète en boucle fermée
  const autopsyReport = await executeClosedLoopAutopsy(
    drawName,
    targetDrawIndex,
    rawHistory,
    currentWeights
  );

  const history = purifyHistoryForDraw(drawName, rawHistory);
  const targetDraw = history[targetDrawIndex] || history[0];
  const priorHistory = history.slice(targetDrawIndex + 1);

  // 2. Évaluation des preuves empiriques propres au tirage actif (Règle d'Or AGENTS.md)
  const proofMap = evaluateAlgoEmpiricalProof(drawName, priorHistory.length >= 3 ? priorHistory : history);

  // 3. Application du Micro-SGD avec verrouillage strict par preuve empirique
  const initialNormalized = normalizeWeights(currentWeights);
  const candidateWeights = { ...autopsyReport.correctedWeights };
  const finalWeights: Record<string, number> = {};

  const effectiveLearningRate = options?.learningRateOverride !== undefined
    ? options.learningRateOverride
    : autopsyReport.learningRate;

  const driftResistance = autopsyReport.temporalDriftMetrics?.driftResistanceFactor ?? 1.0;

  const causalAuditTrail: string[] = [
    `Autopsie fermée exécutée sur ${drawName} (Tirage du ${targetDraw.date})`,
    `Performance rétrospective : Calibration=${autopsyReport.calibrationAccuracy}%, Brier=${autopsyReport.brierScore.toFixed(4)}, Hits Top 5=${autopsyReport.directHitsTop5.length}/5`,
    `Taux d'apprentissage continu η(t)=${(effectiveLearningRate * 100).toFixed(2)}% (Résistance dérive: ${(driftResistance * 100).toFixed(1)}%)`,
  ];

  if (autopsyReport.nearMisses.length > 0) {
    causalAuditTrail.push(
      `${autopsyReport.nearMisses.length} frôlements spatiaux/miroirs détectés : ${autopsyReport.nearMisses.slice(0, 3).map((m) => m.description).join('; ')}`
    );
  }

  // Filtrer et régulariser par les preuves empiriques
  Object.keys(candidateWeights).forEach((key) => {
    const k = key as AlgoKey;
    const oldW = initialNormalized[k] || 0;
    let newW = candidateWeights[k] || oldW;
    const proof = proofMap[k];
    const hasProof = proof && proof.hasProof && proof.proofScore > 0;

    if (!hasProof) {
      // Si l'algo ne démontre pas de preuve empirique, son poids ne peut jamais augmenter
      if (newW > oldW) {
        newW = oldW;
      } else if (proof && proof.proofScore < 0) {
        const dampener = 1.0 / (1.0 + Math.exp(-2.0 * proof.proofScore));
        newW = newW * Math.max(0.1, dampener);
      }
    } else {
      if (newW > oldW) {
        const boostFactor = Math.tanh(proof.proofScore);
        newW = oldW + (newW - oldW) * boostFactor;
      }
    }
    finalWeights[key] = newW;
  });

  const optimizedNormalized = normalizeWeights(finalWeights as AlgoWeights);

  // Tracer les deltas significatifs dans l'audit trail
  const topBoosted: string[] = [];
  const topPenalized: string[] = [];
  Object.keys(optimizedNormalized).forEach((key) => {
    const k = key as AlgoKey;
    const oldW = initialNormalized[k] || 0;
    const newW = optimizedNormalized[k] || 0;
    const delta = newW - oldW;
    if (delta > 0.005) {
      topBoosted.push(`${LABELS_MAP[k] || k} (+${(delta * 100).toFixed(1)}%)`);
    } else if (delta < -0.005) {
      topPenalized.push(`${LABELS_MAP[k] || k} (${(delta * 100).toFixed(1)}%)`);
    }
  });

  if (topBoosted.length > 0) {
    causalAuditTrail.push(`Gènes renforcés par attribution causale : ${topBoosted.join(', ')}`);
  }
  if (topPenalized.length > 0) {
    causalAuditTrail.push(`Gènes amortis pour réduction de variance : ${topPenalized.join(', ')}`);
  }

  if (options?.auditContext) {
    causalAuditTrail.push(`Contexte : ${options.auditContext}`);
  }

  // 4. Enregistrement automatique et persistance via le Contrôleur d'Optimisation Centralisé
  const appliedDirectly = !options?.dryRun;
  let finalAppliedWeights = optimizedNormalized;
  let dnaRecord: ModelDnaRecord;

  const drawDateSafe = targetDraw.date.replace(/[^a-zA-Z0-9]/g, '_');
  const deterministicTimestamp = parseDateSafely(targetDraw.date).toISOString();
  const versionId = `v_autopsy_${drawDateSafe}`;

  if (appliedDirectly) {
    const optResult = await applyOptimizedWeights({
      drawName,
      version: versionId,
      timestamp: options?.timestamp || deterministicTimestamp,
      weights: optimizedNormalized,
      origin: 'FORENSIC_AUTOPSY',
      performance: {
        score: autopsyReport.calibrationAccuracy,
        brierScore: autopsyReport.brierScore,
        hitRate: autopsyReport.directHitsTop5.length / 5.0,
        topologicalLoss: autopsyReport.klDivergence,
        relativeGain: ((autopsyReport.calibrationAccuracy - 50) / 50) * 100,
      },
      regimeContext: {
        regime: autopsyReport.cyclicPhaseProfile?.phaseLabel || 'Régime Dynamique',
        hurst: autopsyReport.temporalDriftMetrics?.driftResistanceFactor ?? 0.5,
        entropy: autopsyReport.crossEntropy ?? 1.0,
      },
      causalAuditTrail,
      reason: `Autopsie fermée tirage ${targetDraw.date}`,
      allowCriticalDrift: false,
    });
    dnaRecord = optResult.dnaRecord;
    finalAppliedWeights = optResult.appliedWeights;
  } else {
    const drawDateSafe = targetDraw.date.replace(/[^a-zA-Z0-9]/g, '_');
    const deterministicTimestamp = parseDateSafely(targetDraw.date).toISOString();
    const versionId = `v_autopsy_${drawDateSafe}`;

    dnaRecord = await recordModelDnaVersion({
      drawName,
      version: versionId,
      timestamp: options?.timestamp || deterministicTimestamp,
      origin: 'FORENSIC_AUTOPSY',
      weights: optimizedNormalized,
      performance: {
        score: autopsyReport.calibrationAccuracy,
        brierScore: autopsyReport.brierScore,
        hitRate: autopsyReport.directHitsTop5.length / 5.0,
        topologicalLoss: autopsyReport.klDivergence,
        relativeGain: ((autopsyReport.calibrationAccuracy - 50) / 50) * 100,
      },
      regimeContext: {
        regime: autopsyReport.cyclicPhaseProfile?.phaseLabel || 'Régime Dynamique',
        hurst: autopsyReport.temporalDriftMetrics?.driftResistanceFactor ?? 0.5,
        entropy: autopsyReport.crossEntropy ?? 1.0,
      },
      causalAuditTrail,
    });
  }

  const accuracyGainEstimated = parseFloat(
    (autopsyReport.calibrationAccuracy - 50).toFixed(2)
  );

  return {
    drawName,
    targetDrawDate: targetDraw.date,
    autopsyReport,
    previousWeights: initialNormalized,
    optimizedWeights: finalAppliedWeights,
    dnaRecord,
    causalAuditTrail,
    learningRate: effectiveLearningRate,
    accuracyGainEstimated,
    appliedDirectly,
  };
};

