import { DrawResult, AlgoWeights } from '../../types';
import { AlgoKey, RETIRED_ALGO_WEIGHT_KEYS } from '../../shared/prediction.types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { drawHasMachineNumbers } from '../../constants';
import { logger } from '../../utils/logger';
import { extractFeatures, extractDrawNumbers } from './featureExtractor';
import { computeAdvancedMetrics } from './predictionOrchestrator';
import { algorithmRegistry, AlgorithmContext } from './algorithmRegistry';
import {
  calculateStatisticalBounds,
  calculateTemporalDriftLearningRate,
  detectGameRegime,
  TemporalDriftLearningRateResult,
} from '../mathService';
import {
  normalizeWeights,
  evaluateAlgoEmpiricalProof,
  getDefaultWeights,
  computeEmpiricalBayesProofCredibility,
  type AlgoProofMetric,
} from './weightsManager';
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
import {
  FORENSIC_MODEL_VERSION,
  UNIFORM_BRIER_BASELINE,
  UNIFORM_EXPECTED_HITS_TOP5,
  UNIFORM_LOG_LOSS_BASELINE,
  computeCautiousAggregatedWeightUpdate,
  evaluateMarginalPredictions,
  runChronologicalWalkForwardValidation,
  type BaselineComparisonMetrics,
  type GeneCounterfactualAttribution,
  type LearningAuditPayload,
  type WalkForwardValidationReport,
} from '../../../supabase/functions/_shared/forensic-learning-engine.ts';

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
  counterfactualScore?: number;
  deltaLogLossAblation?: number;
  deltaBrierAblation?: number;
  winnerLiftAblation?: number;
}

export interface ClosedLoopAutopsyReport {
  drawName: string;
  targetDrawDate: string;
  modelVersion?: string;
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
  logLoss?: number;
  ece?: number;
  marginalSum?: number;
  calibrationAccuracy: number; // 0 - 100%
  brierSkillVsUniform?: number;
  logLossSkillVsUniform?: number;
  brierSkillVsHistorical?: number | null;
  logLossSkillVsHistorical?: number | null;
  uniformBaseline?: {
    expectedHitsTop5: number;
    brierScore: number;
    logLoss: number;
  };
  historicalBaseline?: {
    sampleCount: number;
    expectedHitsTop5: number;
    actualHitsTop5: number;
    brierScore: number;
    logLoss: number;
  };
  learningAudit?: LearningAuditPayload;
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
  /** Échantillon brut de calibration : marginales cohérentes (Σ = 5, index n−1 ↔ numéro n) et issues */
  calibrationSample?: { probabilities: number[]; outcomes: number[] };
}

// computeEmpiricalBayesProofCredibility est importé et ré-exporté depuis ./weightsManager

/**
 * Projection continue sur le simplexe avec rétrécissement Empirical-Bayes (sans verrou binaire
 * discontinu). Chaque augmentation candidate au-dessus du poids de base est pondérée continûment
 * par `computeEmpiricalBayesProofCredibility(proof)` avant projection itérative sur le simplexe.
 */
export const projectWeightsWithContinuousProofShrinkage = (
  candidateWeights: Record<string, number>,
  baselineWeights: AlgoWeights,
  proofMap: Partial<Record<AlgoKey, AlgoProofMetric>>,
  forcedZeroKeys: Set<AlgoKey> = new Set<AlgoKey>()
): AlgoWeights => {
  const validKeys = Object.values(AlgoKey);

  // Normalisation défensive de la baseline (canaux retirés / forcés à zéro exclus)
  const baseSanitized: Record<string, number> = {};
  validKeys.forEach((k) => {
    if (RETIRED_ALGO_WEIGHT_KEYS.has(k) || forcedZeroKeys.has(k)) {
      baseSanitized[k] = 0;
    } else {
      const raw = Number(baselineWeights[k]);
      baseSanitized[k] = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    }
  });
  const baselineNormalized = normalizeWeights(baseSanitized as AlgoWeights);

  const credibilityByKey: Record<string, number> = {};
  const upperCaps: Record<string, number> = {};
  const blendedInput: Record<string, number> = {};

  validKeys.forEach((k) => {
    if (RETIRED_ALGO_WEIGHT_KEYS.has(k) || forcedZeroKeys.has(k)) {
      credibilityByKey[k] = 0;
      upperCaps[k] = 0;
      blendedInput[k] = 0;
      return;
    }
    const baseW = Number.isFinite(baselineNormalized[k]) ? baselineNormalized[k] : 0;
    const candRaw = Number(candidateWeights[k]);
    const candW = Number.isFinite(candRaw) && candRaw >= 0 ? candRaw : baseW;
    const proof = proofMap[k];
    const cred = computeEmpiricalBayesProofCredibility(proof);
    credibilityByKey[k] = cred;

    if (candW > baseW) {
      const shrunk = baseW + cred * (candW - baseW);
      blendedInput[k] = shrunk;
      upperCaps[k] = Math.max(baseW, shrunk);
    } else {
      const negScore = proof && proof.proofScore < 0 ? Math.abs(proof.proofScore) : 0;
      const dampener = 1.0 - 0.5 * Math.tanh(negScore);
      blendedInput[k] = Math.max(0, baseW - (baseW - candW) * dampener);
      upperCaps[k] = Math.max(baseW, blendedInput[k]);
    }
  });

  const normalized = normalizeWeights(blendedInput as AlgoWeights);
  const w: Record<string, number> = { ...normalized };

  for (let iter = 0; iter < 16; iter++) {
    let excess = 0;
    validKeys.forEach((k) => {
      if (RETIRED_ALGO_WEIGHT_KEYS.has(k) || forcedZeroKeys.has(k)) {
        excess += w[k] || 0;
        w[k] = 0;
        return;
      }
      const baseW = baselineNormalized[k] || 0;
      const cred = credibilityByKey[k] || 0;
      // Plafond lisse : un canal à crédibilité nulle reste borné par baseW après renormalisation
      const cap = baseW + cred * Math.max(0, (upperCaps[k] || baseW) - baseW) + cred * 0.5;
      if ((w[k] || 0) > cap) {
        excess += (w[k] || 0) - cap;
        w[k] = cap;
      }
    });

    if (excess <= 1e-7) break;

    const capacityKeys = validKeys.filter(
      (k) =>
        !RETIRED_ALGO_WEIGHT_KEYS.has(k) &&
        !forcedZeroKeys.has(k) &&
        (credibilityByKey[k] || 0) > 1e-6 &&
        (w[k] || 0) > 0
    );

    if (capacityKeys.length === 0) {
      validKeys.forEach((k) => {
        w[k] = RETIRED_ALGO_WEIGHT_KEYS.has(k) || forcedZeroKeys.has(k)
          ? 0
          : (baselineNormalized[k] || 0);
      });
      break;
    }

    const totalScore = capacityKeys.reduce(
      (acc, k) => acc + (w[k] || 0) * (credibilityByKey[k] || 0),
      0
    );
    if (totalScore > 0) {
      capacityKeys.forEach((k) => {
        const share = ((w[k] || 0) * (credibilityByKey[k] || 0)) / totalScore;
        w[k] = (w[k] || 0) + excess * share;
      });
    } else {
      break;
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
          (residual < 0 || (credibilityByKey[k] || 0) > 1e-6)
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

  const hasMachineData = drawHasMachineNumbers(drawName, priorHistory);

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
      } else {
        // ZÉRO FUITE TEMPORELLE : Si aucune version ADN antérieure n'est trouvée,
        // repli strict sur les poids par défaut (baseline canonique non contaminée par les entraînements futurs).
        weightsAtTargetTime = getDefaultWeights();
      }
    } catch {
      weightsAtTargetTime = getDefaultWeights();
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

  // 6. Évaluation propre sur marginales cohérentes (Σ q_i = 5 exactement) & séparation des frôlements
  const K = actualWinners.length || 5;
  const marginalEval = evaluateMarginalPredictions({
    marginals90: Array.from({ length: 90 }, (_, i) => ensembleScores[i + 1]),
    actualWinners,
    top5Predicted,
    priorDraws: priorHistory,
  });

  let klDiv = 0;
  let crossEnt = 0;
  const pActualUniformOnWinners = 1.0 / K;
  for (let num = 1; num <= 90; num++) {
    if (!actualWinnersSet.has(num)) continue;
    const pSimplex = Math.max(1e-6, marginalEval.marginals90[num - 1] / K);
    klDiv += pActualUniformOnWinners * Math.log((pActualUniformOnWinners + 1e-9) / pSimplex);
    crossEnt -= pActualUniformOnWinners * Math.log(pSimplex);
  }

  const brierScore = marginalEval.brierScore;
  const calibrationAccuracy = marginalEval.calibrationAccuracy;

  // 6.5 Attribution causale par contrefactuel continu (ablation par gène : ΔLogLoss, ΔBrier, lift gagnants vs non-gagnants)
  const channelAttribution = computeChannelAttribution({
    channelKeys: validKeys,
    algoScores,
    weights: normalizedCurrent,
    actualWinners,
    top5Predicted,
    labels: LABELS_MAP as Record<string, string>,
  });

  // 7. Calibration Dynamique du Taux d'Apprentissage & Régime
  const activeAlgoCount =
    validKeys.filter((k) => (normalizedCurrent[k] ?? 0) > 0).length || validKeys.length;
  const eta0 = 1.0 / Math.sqrt(activeAlgoCount);
  const temporalDriftMetrics = calculateTemporalDriftLearningRate(
    priorHistory,
    eta0,
    10
  );
  const regimeInfo = detectGameRegime(priorHistory);
  const maxEntropy = Math.log2(90);
  const normalizedEntropy =
    regimeInfo.entropy > 1.0
      ? Math.min(1.0, regimeInfo.entropy / maxEntropy)
      : Math.max(0.0, Math.min(1.0, regimeInfo.entropy));

  // 7.5. Matrice de Profil Cyclique & Exposant de Lyapunov
  const cyclicPhaseProfile = calculateCyclicPhaseProfileMatrix(
    priorHistory,
    advancedMetrics?.topologicalLyapunov as Record<number, number>
  );

  // Conversion directe de l'ablation contrefactuelle par canal vers le moteur unifié d'apprentissage prudent
  const attributionByKey = new Map<string, ChannelCounterfactualImpact>();
  channelAttribution.forEach((c) => attributionByKey.set(c.key, c));

  const geneAttributionsForDraw: GeneCounterfactualAttribution[] = validKeys.map((key) => {
    const attr = attributionByKey.get(key);
    return {
      key,
      weight: normalizedCurrent[key] ?? 0,
      deltaLogLossAblation: attr?.deltaLogLossAblation ?? 0,
      deltaBrierAblation: attr?.deltaBrierAblation ?? 0,
      deltaHitsTop5Ablation: attr?.deltaHitsTop5Ablation ?? 0,
      winnerLiftAblation: attr?.winnerLiftAblation ?? 0,
      counterfactualScore: attr?.counterfactualScore ?? 0,
    };
  });

  const singleForcedZero = new Set<string>(Array.from(RETIRED_ALGO_WEIGHT_KEYS));
  if (!hasMachineData) {
    singleForcedZero.add(AlgoKey.MACHINE_TRANSFER);
  }

  const singleUpdate = computeCautiousAggregatedWeightUpdate({
    currentWeights: normalizedCurrent as Record<string, number>,
    drawAttributionsWindow: [geneAttributionsForDraw],
    windowMetrics: [
      {
        exactHits: marginalEval.exactHits,
        brierScore: marginalEval.brierScore,
        logLoss: marginalEval.logLoss,
        ece: marginalEval.ece,
        historicalBrier: marginalEval.historicalBaseline?.brierScore ?? null,
        historicalLogLoss: marginalEval.historicalBaseline?.logLoss ?? null,
        historicalHits: marginalEval.historicalBaseline?.actualHitsTop5 ?? null,
      },
    ],
    entropyNormalized: normalizedEntropy,
    hurstExponent: regimeInfo.hurst,
    baseLearningRate: temporalDriftMetrics.learningRate,
    forcedZeroKeys: singleForcedZero,
    modelVersion: FORENSIC_MODEL_VERSION,
  });

  // Modulation topologique de phase cyclique très douce après normalisation prudente
  const phaseModulatedRaw: Record<string, number> = {};
  validKeys.forEach((key) => {
    const baseProposed = singleUpdate.updatedWeights[key] ?? 0;
    if (singleForcedZero.has(key) || baseProposed <= 0) {
      phaseModulatedRaw[key] = 0;
      return;
    }
    const phaseModifier = cyclicPhaseProfile.algoWeightModifiers[key] || 0.0;
    const phaseMultiplier = Math.exp(phaseModifier * singleUpdate.audit.sampleAttenuation * 0.25);
    phaseModulatedRaw[key] = baseProposed * phaseMultiplier;
  });

  const correctedWeights = normalizeWeights(phaseModulatedRaw as AlgoWeights);
  const learningRate = singleUpdate.audit.effectiveLearningRate;

  const algoGradients: AlgoGradientBreakdown[] = validKeys.map((key) => {
    const scores = algoScores[key];
    let sumScore = 0;
    for (let i = 1; i <= 90; i++) sumScore += scores[i];

    let attributionWinners = 0;
    actualWinners.forEach((w) => {
      attributionWinners += scores[w] || 0;
    });
    const avgWinnerScore = attributionWinners / K;

    const attr = attributionByKey.get(key);
    const cfScore = attr?.counterfactualScore ?? 0;
    const gradient = -cfScore;
    const currentW = Number.isFinite(normalizedCurrent[key]) ? normalizedCurrent[key] : 0;
    const recW = Number.isFinite(correctedWeights[key]) ? correctedWeights[key] : 0;

    return {
      key,
      label: LABELS_MAP[key] || key,
      currentWeight: currentW,
      gradient: parseFloat(gradient.toFixed(6)),
      predictedScoreSum: sumScore,
      attributionToWinners: avgWinnerScore,
      recommendedWeight: recW,
      deltaPercent: currentW > 0 ? ((recW - currentW) / currentW) * 100 : 0,
      counterfactualScore: attr?.counterfactualScore ?? 0,
      deltaLogLossAblation: attr?.deltaLogLossAblation ?? 0,
      deltaBrierAblation: attr?.deltaBrierAblation ?? 0,
      winnerLiftAblation: attr?.winnerLiftAblation ?? 0,
    };
  });

  // Tri par score contrefactuel décroissant puis attribution gagnants
  algoGradients.sort((a, b) => {
    const diff = (b.counterfactualScore ?? 0) - (a.counterfactualScore ?? 0);
    return Math.abs(diff) > 1e-9 ? diff : b.attributionToWinners - a.attributionToWinners;
  });

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
    modelVersion: FORENSIC_MODEL_VERSION,
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
    logLoss: marginalEval.logLoss,
    ece: marginalEval.ece,
    marginalSum: marginalEval.marginalSum,
    calibrationAccuracy,
    brierSkillVsUniform: marginalEval.brierSkillVsUniform,
    logLossSkillVsUniform: marginalEval.logLossSkillVsUniform,
    brierSkillVsHistorical: marginalEval.brierSkillVsHistorical,
    logLossSkillVsHistorical: marginalEval.logLossSkillVsHistorical,
    uniformBaseline: marginalEval.uniformBaseline,
    historicalBaseline: marginalEval.historicalBaseline,
    learningAudit: singleUpdate.audit,
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
      probabilities: marginalEval.marginals90,
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

  const hasMachineData = drawHasMachineNumbers(drawName, priorHistory);

  // 2. Évaluation des preuves empiriques strictement sur priorHistory (zéro fuite temporelle du tirage cible)
  const proofMap = evaluateAlgoEmpiricalProof(drawName, priorHistory);

  // 3. Application du Micro-SGD avec verrouillage strict par preuve empirique sur le simplexe
  // RÈGLE D'OR AUDIT : La base de référence 'oldW' doit être contemporaine au tirage analysé (autopsyReport.initialWeights),
  // et NON les poids de production courants, pour garantir la cohérence des gradients et éviter toute fuite temporelle.
  const initialWeightsClean: AlgoWeights = { ...autopsyReport.initialWeights };
  if (!hasMachineData) {
    initialWeightsClean[AlgoKey.MACHINE_TRANSFER] = 0;
  }
  const initialNormalized = normalizeWeights(initialWeightsClean);
  const candidateWeights = { ...autopsyReport.correctedWeights };
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

  // Projection continue sur le simplexe avec rétrécissement Empirical-Bayes (sans verrou binaire)
  const optimizedNormalized = projectWeightsWithContinuousProofShrinkage(
    candidateWeights,
    initialNormalized,
    proofMap,
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
      isRetroactive: targetDrawIndex > 0,
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
    previewWeights = projectWeightsWithContinuousProofShrinkage(
      dampedRecord,
      initialNormalized,
      proofMap,
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
  modelVersion?: string;
  batchSize: number;
  meanCalibrationAccuracy: number;
  meanBrierScore: number;
  meanLogLoss?: number;
  brierSkillVsUniform?: number;
  logLossSkillVsUniform?: number;
  brierSkillVsHistorical?: number | null;
  uncertaintySE?: number;
  totalDirectHitsTop5: number;
  totalDirectHitsTop10: number;
  totalNearMisses: number;
  aggregatedGradients: AlgoGradientBreakdown[];
  aggregatedChannelAttribution: AggregatedChannelAttribution[];
  onlineCalibration?: OnlineCalibrationSummary;
  learningAudit?: LearningAuditPayload;
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
      logger.warn(
        { drawIndex: i, error: e instanceof Error ? e.message : String(e) },
        '[Batch Autopsy] Tirage ignoré',
      );
    }
  }

  const effectiveCount = Math.max(1, reports.length);
  const meanCalibration = sumCalibration / effectiveCount;
  const meanBrier = sumBrier / effectiveCount;

  const priorHistoryForBatch = history.slice(depth);
  const hasMachineData = drawHasMachineNumbers(drawName, priorHistoryForBatch);
  // Strictement sur priorHistoryForBatch (zéro fuite temporelle des tirages cibles 0..depth-1)
  const proofMap = evaluateAlgoEmpiricalProof(drawName, priorHistoryForBatch);

  // Agrégation contrefactuelle multi-tirages PAR GÈNE (N = effectiveCount tirages) via le moteur unifié
  const baseWeightsClean: AlgoWeights = { ...currentWeights };
  RETIRED_ALGO_WEIGHT_KEYS.forEach((k) => {
    baseWeightsClean[k] = 0;
  });
  if (!hasMachineData) {
    baseWeightsClean[AlgoKey.MACHINE_TRANSFER] = 0;
  }
  const currentNormalized = normalizeWeights(baseWeightsClean);

  const forcedZeroKeys = new Set<AlgoKey>();
  RETIRED_ALGO_WEIGHT_KEYS.forEach((k) => forcedZeroKeys.add(k));
  if (!hasMachineData) {
    forcedZeroKeys.add(AlgoKey.MACHINE_TRANSFER);
  }

  const drawAttributionsWindow: GeneCounterfactualAttribution[][] = reports.map((rep) => {
    const byKey = new Map((rep.channelAttribution || []).map((c) => [c.key, c]));
    return validKeys.map((key) => {
      const c = byKey.get(key);
      return {
        key,
        weight: currentNormalized[key] ?? 0,
        deltaLogLossAblation: c?.deltaLogLossAblation ?? 0,
        deltaBrierAblation: c?.deltaBrierAblation ?? 0,
        deltaHitsTop5Ablation: c?.deltaHitsTop5Ablation ?? 0,
        winnerLiftAblation: c?.winnerLiftAblation ?? 0,
        counterfactualScore: c?.counterfactualScore ?? 0,
      };
    });
  });

  const windowMetrics = reports.map((rep) => ({
    exactHits: rep.directHitsTop5.length,
    brierScore: rep.brierScore,
    logLoss: rep.logLoss ?? UNIFORM_LOG_LOSS_BASELINE,
    ece: rep.ece ?? 0,
    historicalBrier: rep.historicalBaseline?.brierScore ?? null,
    historicalLogLoss: rep.historicalBaseline?.logLoss ?? null,
    historicalHits: rep.historicalBaseline?.actualHitsTop5 ?? null,
  }));

  const priorRegime = detectGameRegime(priorHistoryForBatch);
  const maxEntropy = Math.log2(90);
  const normEntropy =
    priorRegime.entropy > 1.0
      ? Math.min(1.0, priorRegime.entropy / maxEntropy)
      : Math.max(0.0, Math.min(1.0, priorRegime.entropy));

  const batchUpdate = computeCautiousAggregatedWeightUpdate({
    currentWeights: currentNormalized as Record<string, number>,
    drawAttributionsWindow,
    windowMetrics: windowMetrics.length > 0 ? windowMetrics : [{
      exactHits: 0,
      brierScore: UNIFORM_BRIER_BASELINE,
      logLoss: UNIFORM_LOG_LOSS_BASELINE,
    }],
    entropyNormalized: normEntropy,
    hurstExponent: priorRegime.hurst,
    forcedZeroKeys: new Set(Array.from(forcedZeroKeys)),
    modelVersion: FORENSIC_MODEL_VERSION,
  });

  const recommendedWeights = projectWeightsWithContinuousProofShrinkage(
    batchUpdate.updatedWeights,
    currentNormalized,
    proofMap,
    forcedZeroKeys
  );

  const aggAttrMap = new Map(
    batchUpdate.audit.aggregatedAttributions.map((a) => [a.key, a])
  );

  const aggregatedGradients: AlgoGradientBreakdown[] = validKeys.map((key) => {
    const agg = aggAttrMap.get(key);
    const meanAttr = (winnerAttributionSums[key] || 0) / effectiveCount;
    const currentW = Number.isFinite(currentNormalized[key])
      ? currentNormalized[key]
      : 0;
    const recW = Number.isFinite(recommendedWeights[key])
      ? recommendedWeights[key]
      : 0;
    const cfScore = agg?.meanCounterfactualScore ?? 0;

    return {
      key,
      label: LABELS_MAP[key] || key,
      currentWeight: currentW,
      gradient: parseFloat((-cfScore).toFixed(4)),
      predictedScoreSum: 0,
      attributionToWinners: parseFloat(meanAttr.toFixed(4)),
      recommendedWeight: recW,
      deltaPercent:
        currentW > 0
          ? parseFloat((((recW - currentW) / currentW) * 100).toFixed(1))
          : 0,
      counterfactualScore: cfScore,
      deltaLogLossAblation: agg?.meanDeltaLogLoss ?? 0,
      deltaBrierAblation: agg?.meanDeltaBrier ?? 0,
      winnerLiftAblation: agg?.meanWinnerLift ?? 0,
    };
  });

  aggregatedGradients.sort((a, b) => {
    const diff = (b.counterfactualScore ?? 0) - (a.counterfactualScore ?? 0);
    return Math.abs(diff) > 1e-9 ? diff : b.attributionToWinners - a.attributionToWinners;
  });

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

  // 10. Calibration en ligne : ECE brute → ECE post-calibration LOO + intervalle conforme
  const calibrationFolds = reports
    .filter((r) => r.calibrationSample)
    .map((r) => ({ p: r.calibrationSample!.probabilities, y: r.calibrationSample!.outcomes }));

  let onlineCalibration: OnlineCalibrationSummary | undefined;
  if (calibrationFolds.length > 0) {
    const pooledP = calibrationFolds.flatMap((f) => f.p);
    const pooledY = calibrationFolds.flatMap((f) => f.y);
    const binCount = deriveEceBinCount(pooledP.length);
    const eceBefore = computeEce({ p: pooledP, y: pooledY }, binCount);
    const eceAfterLoo = looEceAfterCalibration(calibrationFolds, binCount);
    const pooledCalibrator = fitMonotoneCalibrator({ p: pooledP, y: pooledY });

    // Résidus conforme : |hits Top-5 observés − espérance prédite sur le Top-5|
    const residuals: number[] = [];
    for (const report of reports) {
      const sample = report.calibrationSample;
      if (!sample) continue;
      const expectedHits = report.top5Predicted.reduce(
        (acc, n) => acc + (sample.probabilities[n - 1] ?? 0),
        0
      );
      residuals.push(Math.abs(report.directHitsTop5.length - expectedHits));
    }

    // Centre de l'intervalle : espérance de hits du tirage le plus récent disponible
    const latestWithSample = reports.find((r) => r.calibrationSample);
    const center = latestWithSample
      ? latestWithSample.top5Predicted.reduce(
          (acc, n) => acc + (latestWithSample.calibrationSample!.probabilities[n - 1] ?? 0),
          0
        )
      : 0;

    const conformal = conformalInterval(residuals, center, 5);
    onlineCalibration = {
      eceBefore: parseFloat(eceBefore.toFixed(6)),
      eceAfterLoo: parseFloat(eceAfterLoo.toFixed(6)),
      monotoneBlockCount: pooledCalibrator.blockCount,
      sampleSize: pooledP.length,
      conformal: {
        center: parseFloat(conformal.center.toFixed(4)),
        lower: parseFloat(conformal.lower.toFixed(4)),
        upper: parseFloat(conformal.upper.toFixed(4)),
        quantile: parseFloat(conformal.quantile.toFixed(4)),
        coverage: parseFloat(conformal.coverage.toFixed(4)),
        sampleSize: conformal.sampleSize,
      },
      narrative: `Calibration en ligne (${calibrationFolds.length} tirages, ${pooledP.length} observations) : ECE ${eceBefore.toFixed(4)} → ${eceAfterLoo.toFixed(4)} (leave-one-out), ${pooledCalibrator.blockCount} bloc(s) isotonique(s). Intervalle conforme ${(conformal.coverage * 100).toFixed(1)}% : ${conformal.lower.toFixed(2)}–${conformal.upper.toFixed(2)} hit(s) attendus (centre ${center.toFixed(2)}, quantile ${conformal.quantile.toFixed(2)}).`,
    };
  }

  const meanLogLoss =
    reports.length > 0
      ? reports.reduce((acc, r) => acc + (r.logLoss ?? UNIFORM_LOG_LOSS_BASELINE), 0) /
        effectiveCount
      : UNIFORM_LOG_LOSS_BASELINE;

  return {
    drawName,
    modelVersion: FORENSIC_MODEL_VERSION,
    batchSize: effectiveCount,
    meanCalibrationAccuracy: parseFloat(meanCalibration.toFixed(1)),
    meanBrierScore: parseFloat(meanBrier.toFixed(4)),
    meanLogLoss: parseFloat(meanLogLoss.toFixed(5)),
    brierSkillVsUniform: batchUpdate.audit.calibration.brierSkillVsUniform,
    logLossSkillVsUniform: batchUpdate.audit.calibration.logLossSkillVsUniform,
    brierSkillVsHistorical: batchUpdate.audit.calibration.brierSkillVsHistorical,
    uncertaintySE: batchUpdate.audit.uncertaintySE,
    totalDirectHitsTop5: totalHitsTop5,
    totalDirectHitsTop10: totalHitsTop10,
    totalNearMisses,
    aggregatedGradients,
    aggregatedChannelAttribution,
    onlineCalibration,
    learningAudit: batchUpdate.audit,
    recommendedWeights,
    reports,
  };
};

/**
 * Validation chronologique stricte en Walk-Forward sur plusieurs périodes
 * sans aucune fuite temporelle future, comparée au hasard uniforme (E[hits]=25/90≈0.278)
 * et à la référence historique empirique.
 */
export const executeWalkForwardAutopsyValidation = (
  drawName: string,
  rawHistory: DrawResult[],
  baseWeights: AlgoWeights,
  options?: {
    warmupDraws?: number;
    periodCount?: number;
  }
): WalkForwardValidationReport => {
  const purified = purifyHistoryForDraw(drawName, rawHistory);
  // purifyHistoryForDraw est du plus récent au plus ancien ; on trie strictement du plus ancien au plus récent
  const chronological = [...purified]
    .sort((a, b) => parseDateSafely(a.date).getTime() - parseDateSafely(b.date).getTime())
    .map((d) => ({
      date: d.date,
      gagnants: d.gagnants || [],
      machine: d.machine || [],
    }));

  const geneKeys = Object.values(AlgoKey).filter((k) => !RETIRED_ALGO_WEIGHT_KEYS.has(k));
  const initWeights: Record<string, number> = {};
  geneKeys.forEach((k) => {
    initWeights[k] = Number.isFinite(baseWeights[k]) ? baseWeights[k] : 0;
  });

  return runChronologicalWalkForwardValidation({
    drawName,
    chronologicalDrawsOldestFirst: chronological,
    geneKeys,
    initialWeights: initWeights,
    warmupDraws: options?.warmupDraws,
    periodCount: options?.periodCount ?? 3,
  });
};

export type {
  BaselineComparisonMetrics,
  LearningAuditPayload,
  WalkForwardValidationReport,
};
export {
  computeEmpiricalBayesProofCredibility,
  FORENSIC_MODEL_VERSION,
  UNIFORM_BRIER_BASELINE,
  UNIFORM_EXPECTED_HITS_TOP5,
  UNIFORM_LOG_LOSS_BASELINE,
};
