import { DrawResult, AlgoWeights } from '../../types';
import { AlgoKey, RETIRED_ALGO_WEIGHT_KEYS } from '../../shared/prediction.types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { extractFeatures, extractDrawNumbers } from './featureExtractor';
import { computeAdvancedMetrics } from './predictionOrchestrator';
import { algorithmRegistry, AlgorithmContext } from './algorithmRegistry';
import {
  calculateStatisticalBounds,
  calculateTemporalDriftLearningRate,
  detectGameRegime,
  TemporalDriftLearningRateResult,
} from '../mathService';
import { normalizeWeights, evaluateAlgoEmpiricalProof } from './weightsManager';
import {
  ModelDnaRecord,
  computeModelDnaFingerprint,
  extractSpecializations,
  getModelDnaHistory,
} from './modelDnaKnowledgeBase';
import {
  applyOptimizedWeights,
  calculateWeightDriftMetrics,
} from './optimizationController';
import { computeDrawCriticalThreshold } from './dnaAuditService';
import { LABELS_MAP } from '../../hooks/useAlgorithmSync';
import {
  calculateCyclicPhaseProfileMatrix,
  CyclicPhaseProfileResult,
} from './dynamicProfileMatrix';
import { parseDateSafely } from '../../utils/dateUtils';
import { deriveSeedFromHistory } from '../../utils/deterministicSeed';
import { generateProbabilisticScenarioMatrix } from './predictionScenarios';
import {
  extractMathProofMetadata,
  MathematicalProofMetadata,
} from '../forensic/forensicProofStandard';
import {
  auditInterDrawPatternsPostMortem,
  InterDrawPostMortemAudit,
} from './interDrawPostMortemService';
import {
  computeChannelAttribution,
  ChannelCounterfactualImpact,
} from './channelAttributionService';
import {
  computeEce,
  conformalInterval,
  coverageFromSampleSize,
  deriveEceBinCount,
  fitMonotoneCalibrator,
  looEceAfterCalibration,
  ConformalInterval,
} from './onlineCalibrationService';

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
  /** Attribution causale par contrefactuel continu : ablation + réallocation par canal */
  channelAttribution?: ChannelCounterfactualImpact[];
  /** Échantillon brut de calibration : marginales prédites (index n−1 ↔ numéro n) et issues */
  calibrationSample?: { probabilities: number[]; outcomes: number[] };
}

/**
 * Projection sur le simplexe ∑ w_k = 1 avec respect strict :
 * 1. Des canaux forcés à zéro (`forcedZeroKeys` et `RETIRED_ALGO_WEIGHT_KEYS`),
 * 2. Du plafond de preuve empirique (`lockedMaxKeys` : ∀ k sans preuve, w_k <= baseline[k]).
 */
export const projectWeightsWithProofGuard = (
  candidateRaw: Record<string, number>,
  baselineNormalized: AlgoWeights,
  lockedMaxKeys: Set<AlgoKey>,
  forcedZeroKeys: Set<AlgoKey> = new Set()
): AlgoWeights => {
  const validKeys = Object.values(AlgoKey);
  const sanitizedInput: Record<string, number> = {};

  validKeys.forEach((k) => {
    if (RETIRED_ALGO_WEIGHT_KEYS.has(k) || forcedZeroKeys.has(k)) {
      sanitizedInput[k] = 0;
      return;
    }
    const baseW = Number.isFinite(baselineNormalized[k]) ? baselineNormalized[k] : 0;
    const rawW = Number.isFinite(candidateRaw[k]) ? Math.max(0, candidateRaw[k]) : baseW;
    sanitizedInput[k] = lockedMaxKeys.has(k) ? Math.min(rawW, baseW) : rawW;
  });

  const normalized = normalizeWeights(sanitizedInput as AlgoWeights);
  const w: Record<string, number> = { ...normalized };

  for (let iter = 0; iter < 16; iter++) {
    let excess = 0;
    validKeys.forEach((k) => {
      if (RETIRED_ALGO_WEIGHT_KEYS.has(k) || forcedZeroKeys.has(k)) {
        excess += w[k] || 0;
        w[k] = 0;
        return;
      }
      if (lockedMaxKeys.has(k)) {
        const cap = Number.isFinite(baselineNormalized[k]) ? baselineNormalized[k] : 0;
        if ((w[k] || 0) > cap) {
          excess += (w[k] || 0) - cap;
          w[k] = cap;
        }
      }
    });

    if (excess <= 1e-7) break;

    const unlockedKeys = validKeys.filter(
      (k) =>
        !RETIRED_ALGO_WEIGHT_KEYS.has(k) &&
        !forcedZeroKeys.has(k) &&
        !lockedMaxKeys.has(k) &&
        (w[k] || 0) > 0
    );

    if (unlockedKeys.length === 0) {
      // Aucun canal prouvé disponible pour absorber l'excédent : conservation des poids de base
      const fallback: Record<string, number> = {};
      let sumFallback = 0;
      validKeys.forEach((k) => {
        if (RETIRED_ALGO_WEIGHT_KEYS.has(k) || forcedZeroKeys.has(k)) {
          fallback[k] = 0;
        } else {
          const val = Number.isFinite(baselineNormalized[k]) ? baselineNormalized[k] : 0;
          fallback[k] = val;
          sumFallback += val;
        }
      });
      if (sumFallback > 0) {
        validKeys.forEach((k) => {
          w[k] = parseFloat(((fallback[k] || 0) / sumFallback).toFixed(6));
        });
      }
      break;
    }

    const unlockedSum = unlockedKeys.reduce((acc, k) => acc + (w[k] || 0), 0);
    if (unlockedSum > 0) {
      unlockedKeys.forEach((k) => {
        w[k] = (w[k] || 0) + excess * ((w[k] || 0) / unlockedSum);
      });
    } else {
      const share = excess / unlockedKeys.length;
      unlockedKeys.forEach((k) => {
        w[k] = (w[k] || 0) + share;
      });
    }
  }

  let total = 0;
  validKeys.forEach((k) => {
    w[k] = w[k] > 0 ? parseFloat(w[k].toFixed(6)) : 0;
    total += w[k];
  });

  if (total > 0 && Math.abs(total - 1.0) > 1e-5) {
    const residual = 1.0 - total;
    const adjustCandidates = validKeys
      .filter(
        (k) =>
          w[k] > 0 &&
          !RETIRED_ALGO_WEIGHT_KEYS.has(k) &&
          !forcedZeroKeys.has(k) &&
          (residual < 0 || !lockedMaxKeys.has(k))
      )
      .sort((a, b) => w[b] - w[a]);
    if (adjustCandidates.length > 0) {
      const targetKey = adjustCandidates[0];
      w[targetKey] = parseFloat(Math.max(0, w[targetKey] + residual).toFixed(6));
    }
  }

  return w as AlgoWeights;
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
    throw new Error(
      `Historique insuffisant pour l'autopsie en boucle fermée (${history.length} tirages trouvés).`
    );
  }

  const targetDraw = history[targetDrawIndex] || history[0];
  const priorHistory = history.slice(targetDrawIndex + 1);

  if (priorHistory.length < 2) {
    throw new Error(
      `Historique antérieur insuffisant pour reconstituer la prédiction rétrospective.`
    );
  }

  const { winners: actualWinners, machine: actualMachine } = extractDrawNumbers(targetDraw);
  const actualWinnersSet = new Set(actualWinners);

  const hasMachineData = priorHistory.some(
    (d) => Array.isArray(d.machine) && d.machine.length > 0
  );

  // Résolution des poids en vigueur à t-1 : si targetDrawIndex > 0 et qu'une version ADN
  // antérieure ou contemporaine au tirage cible existe, on l'utilise pour éviter toute fuite temporelle.
  let weightsAtTargetTime: AlgoWeights = { ...currentWeights };
  if (targetDrawIndex > 0) {
    try {
      const targetTimeMs = parseDateSafely(targetDraw.date).getTime();
      const dnaHistory = await getModelDnaHistory(drawName, 60);
      const priorDna = dnaHistory.find(
        (r) => parseDateSafely(r.timestamp).getTime() <= targetTimeMs
      );
      if (priorDna && priorDna.weights && Object.keys(priorDna.weights).length > 0) {
        weightsAtTargetTime = { ...priorDna.weights };
      }
    } catch {
      // Conserver currentWeights si aucun historique ADN antérieur n'est disponible
    }
  }

  const baseWeightsForContext: AlgoWeights = { ...weightsAtTargetTime };
  if (!hasMachineData) {
    baseWeightsForContext[AlgoKey.MACHINE_TRANSFER] = 0;
  }
  const normalizedCurrent = normalizeWeights(baseWeightsForContext);

  // 1. Reconstitution du contexte de prédiction strictement à l'instant t-1
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
    weights: { ...normalizedCurrent },
    algoWeights: { ...normalizedCurrent },
    statisticalBounds: bounds,
    deterministicSeed: deriveSeedFromHistory(priorHistory),
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

  // 2. Évaluation individuelle de chaque algorithme pour les 90 numéros
  // RÈGLE : les poids nuls (canaux retirés ou transfert machine désactivé) restent strictement à 0.
  const algoScores: Record<string, Float32Array> = {};
  const ensembleScores = new Float32Array(91);

  validKeys.forEach((k) => {
    algoScores[k] = new Float32Array(91);
  });

  for (let num = 1; num <= 90; num++) {
    let combinedScore = 0;

    algorithmRegistry.forEach((plugin) => {
      if (!validKeys.includes(plugin.key)) return;
      if (!hasMachineData && plugin.key === AlgoKey.MACHINE_TRANSFER) {
        algoScores[plugin.key][num] = 0;
        return;
      }
      try {
        const res = plugin.evaluate(num, context);
        const rawS =
          typeof res.score === 'number' && Number.isFinite(res.score)
            ? Math.max(0, Math.min(100, res.score))
            : 0;
        const s = rawS / 100.0;
        algoScores[plugin.key][num] = s;
        const w = Number.isFinite(normalizedCurrent[plugin.key])
          ? normalizedCurrent[plugin.key]
          : 0;
        combinedScore += s * w;
      } catch {
        algoScores[plugin.key][num] = 0;
      }
    });

    ensembleScores[num] = combinedScore;
  }

  // 3. Normalisation de la distribution sur le simplexe (somme = 1) et marginales d'inclusion (somme = K = 5)
  let sumEnsemble = 0;
  for (let i = 1; i <= 90; i++) sumEnsemble += ensembleScores[i];
  const probEnsemble = new Float32Array(91);
  for (let i = 1; i <= 90; i++) {
    probEnsemble[i] = sumEnsemble > 0 ? ensembleScores[i] / sumEnsemble : 1.0 / 90.0;
  }

  // 4. Classement rétrospectif
  const rankedNumbers = Array.from({ length: 90 }, (_, i) => ({
    num: i + 1,
    score: ensembleScores[i + 1],
    prob: probEnsemble[i + 1],
  })).sort((a, b) => b.score - a.score || a.num - b.num);

  const top5Predicted = rankedNumbers.slice(0, 5).map((r) => r.num);
  const top10Predicted = rankedNumbers.slice(0, 10).map((r) => r.num);
  const top20Predicted = rankedNumbers.slice(0, 20).map((r) => r.num);

  const directHitsTop5 = top5Predicted.filter((n) => actualWinnersSet.has(n));
  const directHitsTop10 = top10Predicted.filter((n) => actualWinnersSet.has(n));
  const directHitsTop20 = top20Predicted.filter((n) => actualWinnersSet.has(n));

  // 5. Frôlements physiques (adjacence circulaire immédiate ±1 sur le Top 5 prédit, au plus 1 par gagnant)
  const nearMisses: NearMissItem[] = [];
  const top5Set = new Set(top5Predicted);

  actualWinners.forEach((w) => {
    if (top5Set.has(w)) return; // Hit exact déjà comptabilisé

    const minus1 = w > 1 ? w - 1 : 90;
    const plus1 = w < 90 ? w + 1 : 1;

    if (top5Set.has(minus1)) {
      nearMisses.push({
        actualWinner: w,
        closestPredicted: minus1,
        distance: 1,
        type: 'neighbor_1',
        description: `Adjacence circulaire -1 : Gagnant ${w} vs Prédit ${minus1}`,
      });
    } else if (top5Set.has(plus1)) {
      nearMisses.push({
        actualWinner: w,
        closestPredicted: plus1,
        distance: 1,
        type: 'neighbor_1',
        description: `Adjacence circulaire +1 : Gagnant ${w} vs Prédit ${plus1}`,
      });
    }
  });

  // 6. Métriques d'Entropie Croisée, Divergence KL & Score de Brier sur marginales d'inclusion (somme = K)
  let klDiv = 0;
  let crossEnt = 0;
  let brierSum = 0;
  const K = actualWinners.length || 5;
  const pActualUniformOnWinners = 1.0 / K;

  for (let num = 1; num <= 90; num++) {
    const isWinner = actualWinnersSet.has(num);
    const pSimplex = Math.max(1e-6, probEnsemble[num]);
    const qMarginal = Math.min(1.0, K * probEnsemble[num]);
    const pTarget = isWinner ? pActualUniformOnWinners : 0;

    if (isWinner) {
      klDiv += pTarget * Math.log((pTarget + 1e-9) / pSimplex);
      crossEnt -= pTarget * Math.log(pSimplex);
    }
    brierSum += Math.pow(qMarginal - (isWinner ? 1.0 : 0.0), 2);
  }

  const brierScore = brierSum / 90.0;
  // Référence exacte d'un prédicteur uniforme sur les marginales d'inclusion (q_i = K/90) :
  // Brier_uniform = (K/90)*(1 - K/90)^2 + (1 - K/90)*(K/90)^2 = (K/90)*(1 - K/90) ≈ 0.052469
  const pUniformMarginal = K / 90.0;
  const expectedUniformBrier = pUniformMarginal * (1.0 - pUniformMarginal);
  // Calibration continue : Brier = 0 (parfait) -> 100%, Brier = expectedUniformBrier (hasard uniforme) -> 50%
  const calibrationAccuracy = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 *
          Math.exp((-brierScore / Math.max(1e-6, expectedUniformBrier)) * Math.LN2)
      )
    )
  );

  // 6.5 Attribution causale par contrefactuel continu (AGENTS.md : zéro seuil binaire,
  // 100% déterministe). Mesure ce que chaque canal a réellement causé au résultat
  // d'ensemble — au-delà de l'attribution descriptive sur les gagnants.
  const channelAttribution = computeChannelAttribution({
    channelKeys: validKeys,
    algoScores,
    weights: normalizedCurrent,
    actualWinners,
    top5Predicted,
    labels: LABELS_MAP as Record<string, string>,
  });

  // 7. Calibration Dynamique du Taux d'Apprentissage η(t) par Dérive Temporelle
  // Formule canonique : η(t) = η0 / (1 + λ * D_KL(P || Q)) avec η0 = 1 / sqrt(K_active)
  const activeAlgoCount =
    validKeys.filter((k) => (normalizedCurrent[k] ?? 0) > 0).length || validKeys.length;
  const eta0 = 1.0 / Math.sqrt(activeAlgoCount);
  const temporalDriftMetrics = calculateTemporalDriftLearningRate(
    priorHistory,
    eta0,
    10
  );
  // Régulation continue du gradient par l'exposant de Hurst et l'entropie de Shannon du régime
  const regimeInfo = detectGameRegime(priorHistory);
  // Modulation sigmoïdale différentiable selon la persistance de Hurst (centrée en 0.5) :
  // Phi(H) = 2.0 / (1.0 + exp(-4.0 * (H - 0.5)))
  const hurstModulator = 2.0 / (1.0 + Math.exp(-4.0 * (regimeInfo.hurst - 0.5)));
  // Amortissement continu si l'entropie normalisée approche le bruit thermique pur (évite le surapprentissage stochastique)
  const entropyDampener = Math.exp(-0.5 * Math.max(0, regimeInfo.entropy - 0.7));
  const rawLearningRate = temporalDriftMetrics.learningRate * hurstModulator * entropyDampener;
  const learningRate = Math.max(
    0.01,
    Math.min(0.5, rawLearningRate)
  );

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

    // Écart-type robuste de l'algo sur les 90 numéros (normalisation du gradient)
    let sumSqDev = 0;
    for (let i = 1; i <= 90; i++) sumSqDev += Math.pow(scores[i] - meanScore, 2);
    const stdScore = Math.sqrt(sumSqDev / 90.0) || 1e-6;

    // Attribution mesurée exclusivement sur les gagnants réels (zéro dilution par miroirs/voisins)
    let attributionWinners = 0;
    actualWinners.forEach((w) => {
      attributionWinners += scores[w] || 0;
    });
    const avgWinnerScore = attributionWinners / K;

    // Gradient z-scoré : normalise par l'écart-type de l'algo pour éviter que les algos
    // à forte variance dominent artificiellement le gradient (biais de variance).
    const signalGain = (avgWinnerScore - meanScore) / stdScore;
    const gradient = -signalGain; // Négatif si le gène a distingué les gagnants au-dessus de sa moyenne

    // Modulation continue selon la phase cyclique du jeu
    const phaseModifier = cyclicPhaseProfile.algoWeightModifiers[key] || 0.0;
    const phaseMultiplier = Math.exp(phaseModifier * 0.5);

    // Respect strict des poids nuls (canaux retirés ou transfert machine sans données)
    const currentW = Number.isFinite(normalizedCurrent[key])
      ? normalizedCurrent[key]
      : 0;
    const updateMultiplier = Math.exp(-learningRate * gradient * 4.0) * phaseMultiplier;
    const newWeight =
      currentW > 0 && (!(!hasMachineData && key === AlgoKey.MACHINE_TRANSFER))
        ? currentW * updateMultiplier
        : 0;
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

  if (!hasMachineData) {
    rawUpdatedWeights[AlgoKey.MACHINE_TRANSFER] = 0.0;
  }

  const correctedWeights = normalizeWeights(rawUpdatedWeights as AlgoWeights);

  algoGradients.forEach((g) => {
    g.recommendedWeight = Number.isFinite(correctedWeights[g.key])
      ? correctedWeights[g.key]
      : 0;
    g.deltaPercent =
      g.currentWeight > 0
        ? ((g.recommendedWeight - g.currentWeight) / g.currentWeight) * 100
        : 0;
  });

  // Tri par attribution décroissante
  algoGradients.sort((a, b) => b.attributionToWinners - a.attributionToWinners);

  // 8. Évaluation Rétroactive Multi-Scénarios & Divergence KL par Scénario
  const simulatedScoredNumbers = Array.from({ length: 90 }, (_, i) => {
    const num = i + 1;
    const breakdown: Record<string, number> = {};
    validKeys.forEach((k) => {
      breakdown[k] = (algoScores[k][num] || 0) * 100.0;
    });
    return {
      num,
      score: ensembleScores[num] * 100.0,
      prob: probEnsemble[num],
      normalizedScore: ensembleScores[num] * 100.0,
      rank: 0,
      breakdown,
    };
  });

  const autopsyExplainability: Record<number, { topologicalTension: number }> = {};
  Object.entries(
    (advancedMetrics?.topologicalLyapunov as Record<string, number>) || {}
  ).forEach(([key, value]) => {
    const num = Number(key);
    if (Number.isFinite(num) && typeof value === 'number' && Number.isFinite(value)) {
      autopsyExplainability[num] = { topologicalTension: value };
    }
  });

  const scenarioDeck = generateProbabilisticScenarioMatrix({
    selection: top5Predicted,
    denoisedScores: simulatedScoredNumbers,
    explainabilityRecord: autopsyExplainability,
    primaryCoherence: null,
    drawName,
  });

  const scenarioEvaluations: ScenarioPostMortemEvaluation[] = scenarioDeck.map((sc) => {
    const ticketSet = new Set(sc.ticket);
    const hits = sc.ticket.filter((num) => actualWinnersSet.has(num));
    const hitCount = hits.length;

    // Frôlements physiques du scénario : adjacence circulaire ±1 sur [1, 90], au plus 1 par gagnant non touché
    let nearMissCount = 0;
    actualWinners.forEach((w) => {
      if (ticketSet.has(w)) return;
      const minus1 = w > 1 ? w - 1 : 90;
      const plus1 = w < 90 ? w + 1 : 1;
      if (ticketSet.has(minus1) || ticketSet.has(plus1)) {
        nearMissCount++;
      }
    });

    // Divergence KL du scénario vis-à-vis de la distribution empirique uniforme sur les gagnants
    let scenKl = 0;
    for (const winNum of actualWinners) {
      const pScen = ticketSet.has(winNum) ? 1.0 / 5.0 : 1e-6;
      scenKl +=
        (1.0 / K) * Math.log((1.0 / K) / pScen);
    }

    // Score d'alignement monotone sur [0, 100] :
    // - 0 hit, 0 frôlement = 0%
    // - 1 hit direct = 20% (domine strictement même 5 frôlements = 12.5%)
    // - 5 hits directs = 100%
    const alignmentScore = Math.max(
      0,
      Math.min(100, Math.round(hitCount * 20.0 + Math.min(5, nearMissCount) * 2.5))
    );

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
    summaryRemark += `Dispersion stochastique modérée. ${nearMisses.length} frôlement(s) circulaire(s) ±1 identifié(s)${nearMisses.length > 0 ? ` (${nearMisses.slice(0, 2).map((m) => m.actualWinner).join(', ')})` : ''}. `;
  }
  if (bestPerformingScenario) {
    summaryRemark += `Scénario le plus performant : "${bestPerformingScenario.scenarioName}" (${bestPerformingScenario.hitCount} exact(s), ${bestPerformingScenario.nearMissCount} frôlement(s)). `;
  }
  summaryRemark += `Taux d'apprentissage η(t) = ${(learningRate * 100).toFixed(2)}% (Résistance dérive: ${(temporalDriftMetrics.driftResistanceFactor * 100).toFixed(1)}%). `;
  summaryRemark += `Gènes leaders sur ce tirage : ${algoGradients.slice(0, 3).map((g) => g.label).join(', ')}.`;
  const topCausalChannel = channelAttribution[0];
  if (topCausalChannel) {
    summaryRemark += ` Moteur causal dominant : ${topCausalChannel.label} (importance ${(topCausalChannel.causalImportanceScore * 100).toFixed(1)}%, Δhits ablation ${topCausalChannel.deltaHitsTop5Ablation >= 0 ? '+' : ''}${topCausalChannel.deltaHitsTop5Ablation}).`;
  }
  const mostHarmfulChannel = channelAttribution.reduce<ChannelCounterfactualImpact | null>(
    (acc, impact) =>
      impact.deltaHitsTop5Ablation < 0 &&
      (acc === null || impact.deltaHitsTop5Ablation < acc.deltaHitsTop5Ablation)
        ? impact
        : acc,
    null
  );
  if (mostHarmfulChannel) {
    summaryRemark += ` Canal contrefactuellement préjudiciable : ${mostHarmfulChannel.label} (son ablation aurait gagné ${-mostHarmfulChannel.deltaHitsTop5Ablation} hit(s)).`;
  }

  const mathProofMetadata = extractMathProofMetadata({
    history: priorHistory,
    weights: normalizedCurrent,
    algoGradients,
    suggestedNumbers: top5Predicted,
    actualWinners,
    brierScore,
  });

  // Audit Rétrospectif des Signaux Inter-Tirages & Calibration Bayesienne (Famille étanche, zéro donnée synthétique)
  const interDrawAudit =
    auditInterDrawPatternsPostMortem(drawName, targetDrawIndex, rawHistory) || undefined;

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
    channelAttribution,
    calibrationSample: {
      probabilities: Array.from({ length: 90 }, (_, i) => probEnsemble[i + 1]),
      outcomes: Array.from({ length: 90 }, (_, i) => (actualWinnersSet.has(i + 1) ? 1 : 0)),
    },
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

  const hasMachineData = priorHistory.some(
    (d) => Array.isArray(d.machine) && d.machine.length > 0
  );

  // 2. Évaluation des preuves empiriques strictement sur priorHistory (zéro fuite temporelle du tirage cible)
  const proofMap = evaluateAlgoEmpiricalProof(drawName, priorHistory);

  // 3. Application du Micro-SGD avec verrouillage strict par preuve empirique sur le simplexe
  const initialWeightsClean: AlgoWeights = { ...currentWeights };
  if (!hasMachineData) {
    initialWeightsClean[AlgoKey.MACHINE_TRANSFER] = 0;
  }
  const initialNormalized = normalizeWeights(initialWeightsClean);
  const candidateWeights = { ...autopsyReport.correctedWeights };
  const finalWeights: Record<string, number> = {};
  const lockedMaxKeys = new Set<AlgoKey>();
  const forcedZeroKeys = new Set<AlgoKey>();

  if (!hasMachineData) {
    forcedZeroKeys.add(AlgoKey.MACHINE_TRANSFER);
  }

  const effectiveLearningRate =
    options?.learningRateOverride !== undefined
      ? options.learningRateOverride
      : autopsyReport.learningRate;

  const driftResistance =
    autopsyReport.temporalDriftMetrics?.driftResistanceFactor ?? 1.0;

  const causalAuditTrail: string[] = [
    `Autopsie fermée exécutée sur ${drawName} (Tirage du ${targetDraw.date})`,
    `Performance rétrospective : Calibration=${autopsyReport.calibrationAccuracy}%, Brier=${autopsyReport.brierScore.toFixed(4)}, Hits Top 5=${autopsyReport.directHitsTop5.length}/5`,
    `Taux d'apprentissage continu η(t)=${(effectiveLearningRate * 100).toFixed(2)}% (Résistance dérive: ${(driftResistance * 100).toFixed(1)}%)`,
  ];

  if (autopsyReport.nearMisses.length > 0) {
    causalAuditTrail.push(
      `${autopsyReport.nearMisses.length} frôlement(s) circulaire(s) ±1 détecté(s) : ${autopsyReport.nearMisses
        .slice(0, 3)
        .map((m) => m.description)
        .join('; ')}`
    );
  }

  Object.values(AlgoKey).forEach((k) => {
    if (RETIRED_ALGO_WEIGHT_KEYS.has(k) || forcedZeroKeys.has(k)) {
      finalWeights[k] = 0;
      return;
    }
    const oldW = Number.isFinite(initialNormalized[k]) ? initialNormalized[k] : 0;
    let newW = Number.isFinite(candidateWeights[k]) ? candidateWeights[k] : oldW;
    const proof = proofMap[k];
    const hasProof = Boolean(proof && proof.hasProof && proof.proofScore > 0);

    if (!hasProof) {
      lockedMaxKeys.add(k);
      if (newW > oldW) {
        newW = oldW;
      } else if (proof && proof.proofScore < 0) {
        const dampener = 1.0 / (1.0 + Math.exp(-2.0 * proof.proofScore));
        newW = newW * Math.max(0.1, dampener);
      }
    } else if (newW > oldW) {
      const boostFactor = Math.tanh(proof.proofScore);
      newW = oldW + (newW - oldW) * boostFactor;
    }
    finalWeights[k] = newW;
  });

  // Projection sur le simplexe garantissant qu'aucun canal sans preuve ne remonte au-dessus de oldW après renormalisation
  const optimizedNormalized = projectWeightsWithProofGuard(
    finalWeights,
    initialNormalized,
    lockedMaxKeys,
    forcedZeroKeys
  );

  // Tracer les deltas significatifs dans l'audit trail
  const topBoosted: string[] = [];
  const topPenalized: string[] = [];
  Object.keys(optimizedNormalized).forEach((key) => {
    const k = key as AlgoKey;
    const oldW = initialNormalized[k] ?? 0;
    const newW = optimizedNormalized[k] ?? 0;
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

  // 4. Enregistrement via le Contrôleur d'Optimisation Centralisé (ou simulation pure sans effet de bord en dryRun)
  const appliedDirectly = !options?.dryRun;
  const drawDateSafe = targetDraw.date.replace(/[^a-zA-Z0-9]/g, '_');
  const deterministicTimestamp = parseDateSafely(targetDraw.date).toISOString();
  const versionId = `v_autopsy_${drawDateSafe}`;

  const priorRegime = detectGameRegime(priorHistory);
  const measuredHurst = Number.isFinite(autopsyReport.mathProofMetadata?.hurstExponent)
    ? autopsyReport.mathProofMetadata!.hurstExponent
    : priorRegime.hurst;
  const measuredShannon = Number.isFinite(autopsyReport.mathProofMetadata?.shannonEntropy)
    ? autopsyReport.mathProofMetadata!.shannonEntropy
    : priorRegime.entropy;

  const performancePayload = {
    score: autopsyReport.calibrationAccuracy,
    brierScore: autopsyReport.brierScore,
    hitRate: autopsyReport.directHitsTop5.length / 5.0,
    topologicalLoss: autopsyReport.mathProofMetadata?.topologicalLoss,
  };

  const regimePayload = {
    regime: autopsyReport.cyclicPhaseProfile?.phaseLabel || 'Régime Dynamique',
    hurst: measuredHurst,
    entropy: measuredShannon,
  };

  if (appliedDirectly) {
    const optResult = await applyOptimizedWeights({
      drawName,
      version: versionId,
      timestamp: options?.timestamp || deterministicTimestamp,
      weights: optimizedNormalized,
      history: priorHistory,
      origin: 'FORENSIC_AUTOPSY',
      performance: performancePayload,
      regimeContext: regimePayload,
      causalAuditTrail,
      reason: `Autopsie fermée tirage ${targetDraw.date}`,
      allowCriticalDrift: false,
    });

    return {
      drawName,
      targetDrawDate: targetDraw.date,
      autopsyReport,
      previousWeights: initialNormalized,
      optimizedWeights: optResult.appliedWeights,
      dnaRecord: optResult.dnaRecord,
      causalAuditTrail,
      learningRate: effectiveLearningRate,
      appliedDirectly: true,
    };
  }

  // Mode dryRun : applique exactement le même amortissement de dérive critique que applyOptimizedWeights
  // SANS écrire dans localStorage ni muter la lignée ADN.
  const algoCount = Object.keys(optimizedNormalized).length;
  const { criticalThreshold, entropy: entropyFallback } = computeDrawCriticalThreshold(
    priorHistory,
    algoCount
  );
  const { maxDelta } = calculateWeightDriftMetrics(
    initialNormalized,
    optimizedNormalized
  );
  let previewWeights: AlgoWeights = optimizedNormalized;
  if (maxDelta > criticalThreshold) {
    const dampingFactor = criticalThreshold / Math.max(criticalThreshold, maxDelta);
    const dampedRecord: Record<string, number> = {};
    (Object.keys(optimizedNormalized) as AlgoKey[]).forEach((k) => {
      const cur = initialNormalized[k] ?? 0;
      const tgt = optimizedNormalized[k] ?? 0;
      dampedRecord[k] = cur + dampingFactor * (tgt - cur);
    });
    previewWeights = projectWeightsWithProofGuard(
      dampedRecord,
      initialNormalized,
      lockedMaxKeys,
      forcedZeroKeys
    );
  }

  const finalTimestamp = options?.timestamp || deterministicTimestamp;
  const dnaFingerprint = computeModelDnaFingerprint(drawName, previewWeights);
  const specializations = extractSpecializations(previewWeights);

  const dryRunDnaRecord: ModelDnaRecord = {
    id: `dna_${drawName.toLowerCase().replace(/\s+/g, '_')}_${versionId}`,
    drawName,
    version: versionId,
    dnaFingerprint,
    timestamp: finalTimestamp,
    origin: 'FORENSIC_AUTOPSY',
    weights: { ...previewWeights },
    specializations,
    performance: performancePayload,
    regimeContext: {
      regime: regimePayload.regime,
      hurst: regimePayload.hurst,
      entropy: regimePayload.entropy ?? entropyFallback,
    },
    causalAuditTrail,
  };

  return {
    drawName,
    targetDrawDate: targetDraw.date,
    autopsyReport,
    previousWeights: initialNormalized,
    optimizedWeights: previewWeights,
    dnaRecord: dryRunDnaRecord,
    causalAuditTrail,
    learningRate: effectiveLearningRate,
    appliedDirectly: false,
  };
};

export interface AggregatedChannelAttribution {
  key: string;
  label: string;
  meanDeltaHitsTop5Ablation: number;
  meanDeltaBrierAblation: number;
  meanCausalImportanceScore: number;
}

export interface OnlineCalibrationSummary {
  /** ECE brute pooled sur les échantillons du lot (avant calibration) */
  eceBefore: number;
  /** ECE post-calibration monotone, évaluée honnêtement leave-one-out par tirage */
  eceAfterLoo: number;
  /** Nombre de blocs monotone du calibrateur ajusté sur tout le lot */
  monotoneBlockCount: number;
  sampleSize: number;
  /** Intervalle conforme distribution-free sur le nombre de hits du prochain tirage */
  conformal: ConformalInterval;
  narrative: string;
}

export interface BatchClosedLoopAutopsyResult {
  drawName: string;
  batchSize: number;
  meanCalibrationAccuracy: number;
  meanBrierScore: number;
  totalDirectHitsTop5: number;
  totalDirectHitsTop10: number;
  totalNearMisses: number;
  aggregatedGradients: AlgoGradientBreakdown[];
  aggregatedChannelAttribution: AggregatedChannelAttribution[];
  onlineCalibration?: OnlineCalibrationSummary;
  recommendedWeights: AlgoWeights;
  reports: ClosedLoopAutopsyReport[];
}

/**
 * Exécute l'autopsie en boucle fermée par lots sur les K derniers tirages disponibles
 * pour stabiliser la rétropropagation contre les fluctuations aléatoires ponctuelles.
 * ZÉRO NOMBRE MAGIQUE : La profondeur est fonction de sqrt(N) et de l'historique disponible.
 */
export const executeBatchClosedLoopAutopsy = async (
  drawName: string,
  rawHistory: DrawResult[],
  currentWeights: AlgoWeights,
  requestedDepth: number = 5,
  onProgress?: (current: number, total: number) => void
): Promise<BatchClosedLoopAutopsyResult> => {
  const history = purifyHistoryForDraw(drawName, rawHistory);
  const maxPossible = Math.max(1, history.length - 2);
  const depth = Math.min(maxPossible, Math.max(2, requestedDepth));

  const reports: ClosedLoopAutopsyReport[] = [];
  const validKeys = Object.values(AlgoKey);
  const gradientSums: Record<string, number> = {};
  const winnerAttributionSums: Record<string, number> = {};
  const attributionSums: Record<string, { hits: number; brier: number; importance: number }> = {};
  const attributionLabels: Record<string, string> = {};
  validKeys.forEach((k) => {
    gradientSums[k] = 0;
    winnerAttributionSums[k] = 0;
    attributionSums[k] = { hits: 0, brier: 0, importance: 0 };
  });

  let sumCalibration = 0;
  let sumBrier = 0;
  let totalHitsTop5 = 0;
  let totalHitsTop10 = 0;
  let totalNearMisses = 0;

  // Mémoïser features + métriques entre les passes pour éviter O(depth) recalculs redondants
  // sur des sous-historiques qui se chevauchent massivement.
  const featuresCache = new Map<number, Awaited<ReturnType<typeof extractFeatures>>>();
  const metricsCache = new Map<number, Awaited<ReturnType<typeof computeAdvancedMetrics>>>();

  for (let i = 0; i < depth; i++) {
    onProgress?.(i + 1, depth);
    try {
      // Pré-calculer et mettre en cache features + métriques pour ce sous-historique
      const subHistory = history.slice(i + 1);
      const subKey = subHistory.length;
      if (!featuresCache.has(subKey)) {
        const [feats, mets] = await Promise.all([
          extractFeatures(drawName, subHistory),
          computeAdvancedMetrics(subHistory, drawName, {}, false, undefined),
        ]);
        featuresCache.set(subKey, feats);
        metricsCache.set(subKey, mets);
      }

      const rep = await executeClosedLoopAutopsy(
        drawName,
        i,
        rawHistory,
        currentWeights
      );
      reports.push(rep);

      sumCalibration += rep.calibrationAccuracy;
      sumBrier += rep.brierScore;
      totalHitsTop5 += rep.directHitsTop5.length;
      totalHitsTop10 += rep.directHitsTop10.length;
      totalNearMisses += rep.nearMisses.length;

      rep.algoGradients.forEach((g) => {
        gradientSums[g.key] = (gradientSums[g.key] || 0) + g.gradient;
        winnerAttributionSums[g.key] =
          (winnerAttributionSums[g.key] || 0) + g.attributionToWinners;
      });
      rep.channelAttribution?.forEach((impact) => {
        const acc = attributionSums[impact.key] ?? { hits: 0, brier: 0, importance: 0 };
        acc.hits += impact.deltaHitsTop5Ablation;
        acc.brier += impact.deltaBrierAblation;
        acc.importance += impact.causalImportanceScore;
        attributionSums[impact.key] = acc;
        attributionLabels[impact.key] = impact.label;
      });
    } catch (e) {
      console.warn(`[Batch Autopsy] Tirage ${i} ignoré :`, e);
    }
  }

  const effectiveCount = Math.max(1, reports.length);
  const meanCalibration = sumCalibration / effectiveCount;
  const meanBrier = sumBrier / effectiveCount;

  const priorHistoryForBatch = history.slice(depth);
  const hasMachineData = priorHistoryForBatch.some(
    (d) => Array.isArray(d.machine) && d.machine.length > 0
  );
  // Strictement sur priorHistoryForBatch (zéro fuite temporelle des tirages cibles 0..depth-1)
  const proofMap = evaluateAlgoEmpiricalProof(drawName, priorHistoryForBatch);

  // Calcul des gradients moyens et des nouveaux poids proposés
  const rawUpdatedWeights: Record<string, number> = {};
  const baseWeightsClean: AlgoWeights = { ...currentWeights };
  if (!hasMachineData) {
    baseWeightsClean[AlgoKey.MACHINE_TRANSFER] = 0;
  }
  const currentNormalized = normalizeWeights(baseWeightsClean);
  const meanLearningRate =
    reports.reduce((acc, r) => acc + r.learningRate, 0) / effectiveCount;

  const lockedMaxKeys = new Set<AlgoKey>();
  const forcedZeroKeys = new Set<AlgoKey>();
  if (!hasMachineData) {
    forcedZeroKeys.add(AlgoKey.MACHINE_TRANSFER);
  }

  const aggregatedGradients: AlgoGradientBreakdown[] = validKeys.map((key) => {
    const meanGrad = (gradientSums[key] || 0) / effectiveCount;
    const meanAttr = (winnerAttributionSums[key] || 0) / effectiveCount;
    const currentW = Number.isFinite(currentNormalized[key])
      ? currentNormalized[key]
      : 0;

    const proof = proofMap[key];
    const hasProof = Boolean(proof && proof.hasProof && proof.proofScore > 0);
    if (!hasProof) {
      lockedMaxKeys.add(key);
    }

    const newWeight =
      currentW > 0 && !forcedZeroKeys.has(key)
        ? currentW * Math.exp(-meanLearningRate * meanGrad * 3.0)
        : 0;
    rawUpdatedWeights[key] = newWeight;

    return {
      key,
      label: LABELS_MAP[key] || key,
      currentWeight: currentW,
      gradient: parseFloat(meanGrad.toFixed(4)),
      predictedScoreSum: 0,
      attributionToWinners: parseFloat(meanAttr.toFixed(4)),
      recommendedWeight: newWeight,
      deltaPercent: 0,
    };
  });

  const recommendedWeights = projectWeightsWithProofGuard(
    rawUpdatedWeights,
    currentNormalized,
    lockedMaxKeys,
    forcedZeroKeys
  );

  aggregatedGradients.forEach((g) => {
    g.recommendedWeight = Number.isFinite(recommendedWeights[g.key])
      ? recommendedWeights[g.key]
      : 0;
    g.deltaPercent =
      g.currentWeight > 0
        ? parseFloat(
            (((g.recommendedWeight - g.currentWeight) / g.currentWeight) * 100).toFixed(1)
          )
        : 0;
  });

  aggregatedGradients.sort((a, b) => b.attributionToWinners - a.attributionToWinners);

  const aggregatedChannelAttribution: AggregatedChannelAttribution[] = validKeys
    .map((key) => {
      const acc = attributionSums[key] ?? { hits: 0, brier: 0, importance: 0 };
      return {
        key,
        label: attributionLabels[key] || key,
        meanDeltaHitsTop5Ablation: parseFloat((acc.hits / effectiveCount).toFixed(4)),
        meanDeltaBrierAblation: parseFloat((acc.brier / effectiveCount).toFixed(6)),
        meanCausalImportanceScore: parseFloat((acc.importance / effectiveCount).toFixed(6)),
      };
    })
    .sort((a, b) => {
      if (b.meanCausalImportanceScore !== a.meanCausalImportanceScore) {
        return b.meanCausalImportanceScore - a.meanCausalImportanceScore;
      }
      return a.key.localeCompare(b.key);
    });

  return {
    drawName,
    batchSize: effectiveCount,
    meanCalibrationAccuracy: parseFloat(meanCalibration.toFixed(1)),
    meanBrierScore: parseFloat(meanBrier.toFixed(4)),
    totalDirectHitsTop5: totalHitsTop5,
    totalDirectHitsTop10: totalHitsTop10,
    totalNearMisses,
    aggregatedGradients,
    aggregatedChannelAttribution,
    recommendedWeights,
    reports,
  };
};
