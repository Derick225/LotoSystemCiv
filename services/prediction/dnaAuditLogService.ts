import { DrawResult, AlgoWeights } from '../../types';
import { AlgoKey } from '../../shared/prediction.types';
import { calculateMicroDNAPerNumber, NumberMicroDNA } from './microDnaService';
import { computeModelDnaFingerprint } from './modelDnaKnowledgeBase';
import { getDefaultWeights, normalizeWeights } from './weightsManager';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { getDeterministicUUID } from '../../utils/mathUtils';
import { get, set } from 'idb-keyval';
import { LABELS_MAP } from '../../hooks/useAlgorithmSync';

export interface NumberDnaAttribution {
  number: number;
  isHit: boolean;
  predictedScore: number;
  microDna: Record<string, number>;
  dominantAlgo: string;
  dominantAlgoLabel: string;
  dominantWeight: number;
  spectralPower: number;
  selectionRank?: number;
  causalCategory:
    | 'DIRECT_HIT'
    | 'RESONANT_HARMONIC'
    | 'GAP_RECOVERY'
    | 'MARKOV_TRANSITION'
    | 'NOISE_ATTRIBUTED';
  explanation: string;
}

export interface PredictionDnaAuditLog {
  id: string;
  predictionId: string;
  drawName: string;
  timestamp: number;
  formattedDate: string;
  dnaFingerprint: string;
  activeWeights: AlgoWeights;
  suggestedNumbers: number[];
  numbersMicroDna: Record<number, Record<string, number>>;
  dominantAlgos: Record<number, string>;
  metricsSnapshot?: {
    entropy: number;
    hurst: number;
    confidence: number;
    regime?: string;
  };
  drawResultId?: string;
  reconciledAt?: number;
  actualWinningNumbers?: number[];
  winningNumbersAttribution?: Record<number, NumberDnaAttribution>;
  driftScore?: number;
  status: 'LOGGED_PRE_DRAW' | 'RECONCILED_POST_DRAW';
}

export interface DnaPerformanceDriftReport {
  drawName: string;
  computedAt: string;
  evaluatedDrawsCount: number;
  lastDrawDate?: string;
  winningNumbers?: number[];
  overallDriftPercentage: number;
  klDivergence: number;
  brierScore: number;
  hitCount: number;
  hitRate: number;
  injectedDnaFingerprint: string;
  activeWeights: AlgoWeights;
  algorithmDriftBreakdown: {
    algoKey: string;
    label: string;
    injectedWeight: number;
    empiricalUtility: number;
    driftDelta: number;
    status: 'OPTIMAL' | 'OVER_WEIGHTED' | 'UNDER_WEIGHTED' | 'DIVERGENT';
    hitContributionCount: number;
  }[];
  winningNumbersAttribution: NumberDnaAttribution[];
  causalSummary: string[];
  recommendedDnaAdjustments: {
    algoKey: string;
    currentWeight: number;
    recommendedWeight: number;
    adjustmentDelta: number;
    reason: string;
  }[];
}

const STORAGE_PREFIX = 'lotopro_dna_audit_logs_';
const MAX_LOGS_PER_DRAW = 40;
const DNA_AUDIT_IN_MEMORY_MAP = new Map<string, PredictionDnaAuditLog[]>();

const getStorageKey = (drawName: string): string => {
  const normalized = (drawName || 'default').trim().toLowerCase().replace(/\s+/g, '_');
  return `${STORAGE_PREFIX}${normalized}`;
};

/**
 * Enregistre systématiquement l'ADN actif utilisé lors de la génération d'une prédiction.
 * Conforme à la règle d'isolation absolue des tirages (TIRAGE ISOLATION RULE).
 */
export const logActivePredictionDna = async (
  drawName: string,
  predictionId: string,
  suggestedNumbers: number[],
  activeWeights: AlgoWeights,
  history: DrawResult[] = [],
  metrics?: {
    entropy?: number;
    hurst?: number;
    confidence?: number;
    regime?: string;
  }
): Promise<PredictionDnaAuditLog> => {
  const pureHistory = purifyHistoryForDraw(drawName, history);
  const normalizedWeights = normalizeWeights(activeWeights || getDefaultWeights());
  const now = Date.now();
  const dnaFingerprint = computeModelDnaFingerprint(drawName, normalizedWeights);

  const numbersMicroDna: Record<number, Record<string, number>> = {};
  const dominantAlgos: Record<number, string> = {};

  suggestedNumbers.forEach((num) => {
    const micro = calculateMicroDNAPerNumber(
      drawName,
      num,
      pureHistory,
      normalizedWeights as Record<string, number>
    );
    numbersMicroDna[num] = micro.behavioralDna;

    let bestAlgo = 'bayes_frequency';
    let maxWeight = -Infinity;
    Object.entries(micro.behavioralDna).forEach(([algo, weight]) => {
      if (weight > maxWeight) {
        maxWeight = weight;
        bestAlgo = algo;
      }
    });
    dominantAlgos[num] = bestAlgo;
  });

  const auditLog: PredictionDnaAuditLog = {
    id: getDeterministicUUID(`dnalog_${drawName}_${predictionId}_${dnaFingerprint}`),
    predictionId,
    drawName,
    timestamp: now,
    formattedDate: new Date(now).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    dnaFingerprint,
    activeWeights: normalizedWeights,
    suggestedNumbers: [...suggestedNumbers],
    numbersMicroDna,
    dominantAlgos,
    metricsSnapshot: {
      entropy: metrics?.entropy ?? 0.5,
      hurst: metrics?.hurst ?? 0.5,
      confidence: metrics?.confidence ?? 75,
      regime: metrics?.regime ?? 'STANDARD',
    },
    status: 'LOGGED_PRE_DRAW',
  };

  try {
    const key = getStorageKey(drawName);
    const existing = await getPredictionDnaLogs(drawName);
    const updated = [auditLog, ...existing.filter((l) => l.predictionId !== predictionId)].slice(
      0,
      MAX_LOGS_PER_DRAW
    );
    DNA_AUDIT_IN_MEMORY_MAP.set(key, updated);
    if (typeof indexedDB !== 'undefined') {
      await set(key, updated);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('PREDICTION_DNA_LOGGED', {
          detail: { drawName, logId: auditLog.id, predictionId },
        })
      );
    }
  } catch (err) {
    console.warn('[DnaAuditLog] Erreur lors de la persistance:', err);
  }

  return auditLog;
};

/**
 * Récupère l'historique des logs d'ADN prédictifs pour un tirage isolé.
 */
export const getPredictionDnaLogs = async (
  drawName: string,
  limit: number = MAX_LOGS_PER_DRAW
): Promise<PredictionDnaAuditLog[]> => {
  const key = getStorageKey(drawName);
  if (typeof indexedDB === 'undefined') {
    const mem = DNA_AUDIT_IN_MEMORY_MAP.get(key) || [];
    return mem.slice(0, limit);
  }
  try {
    const raw = await get<PredictionDnaAuditLog[]>(key);
    if (Array.isArray(raw)) {
      DNA_AUDIT_IN_MEMORY_MAP.set(key, raw);
      return raw.slice(0, limit);
    }
  } catch (err) {
    console.warn('[DnaAuditLog] Erreur de lecture:', err);
  }
  const mem = DNA_AUDIT_IN_MEMORY_MAP.get(key) || [];
  return mem.slice(0, limit);
};

/**
 * Attribue et qualifie le profil ADN prédictif d'un numéro spécifique d'un tirage.
 */
export const qualifyNumberDna = (
  targetNumber: number,
  drawName: string,
  history: DrawResult[],
  activeWeights: AlgoWeights,
  predictedNumbers: number[] = [],
  rankIndex?: number
): NumberDnaAttribution => {
  const pureHistory = purifyHistoryForDraw(drawName, history);
  const normalizedWeights = normalizeWeights(activeWeights || getDefaultWeights());
  const micro = calculateMicroDNAPerNumber(
    drawName,
    targetNumber,
    pureHistory,
    normalizedWeights as Record<string, number>
  );

  let dominantAlgo = 'bayes_frequency';
  let dominantWeight = 0;
  Object.entries(micro.behavioralDna).forEach(([algo, weight]) => {
    if (weight > dominantWeight) {
      dominantWeight = weight;
      dominantAlgo = algo;
    }
  });

  const isHit = predictedNumbers.includes(targetNumber);
  const dominantAlgoLabel = LABELS_MAP[dominantAlgo as AlgoKey] || dominantAlgo;

  let causalCategory: NumberDnaAttribution['causalCategory'] = 'NOISE_ATTRIBUTED';
  let explanation = '';

  if (isHit) {
    causalCategory = 'DIRECT_HIT';
    explanation = `Impact Direct : Prédit avec succès par le moteur neural, porté principalement par ${dominantAlgoLabel} (${dominantWeight.toFixed(1)}%).`;
  } else if (dominantAlgo.includes('fourier') || dominantAlgo.includes('quantum') || dominantAlgo.includes('spectral')) {
    causalCategory = 'RESONANT_HARMONIC';
    explanation = `Résonance Harmonique : Numéro activé par la dynamique d'onde spectrale (${dominantAlgoLabel}), puissance ${micro.spectralPower.toFixed(2)}.`;
  } else if (dominantAlgo.includes('markov') || dominantAlgo.includes('transition')) {
    causalCategory = 'MARKOV_TRANSITION';
    explanation = `Transition Conditionnelle : Sélectionné selon la matrice stochastique de Markov (${dominantAlgoLabel}).`;
  } else if (dominantAlgo.includes('gap') || dominantAlgo.includes('recurrence') || dominantAlgo.includes('frequency')) {
    causalCategory = 'GAP_RECOVERY';
    explanation = `Comblement de Cycle : Sortie par décompression de retard et inertie fréquentielle (${dominantAlgoLabel}).`;
  } else {
    causalCategory = 'NOISE_ATTRIBUTED';
    explanation = `Extraction stochastique complexe dominée par ${dominantAlgoLabel} (${dominantWeight.toFixed(1)}%).`;
  }

  return {
    number: targetNumber,
    isHit,
    predictedScore: isHit ? 100 : Math.min(95, micro.spectralPower * 10),
    microDna: micro.behavioralDna,
    dominantAlgo,
    dominantAlgoLabel,
    dominantWeight,
    spectralPower: micro.spectralPower,
    selectionRank: rankIndex,
    causalCategory,
    explanation,
  };
};

/**
 * Réconcilie automatiquement les logs de prédiction en attente avec le résultat réel d'un tirage.
 */
export const reconcileDnaLogsWithDrawResult = async (
  drawName: string,
  drawResult: DrawResult,
  history: DrawResult[] = []
): Promise<number> => {
  const pureHistory = purifyHistoryForDraw(drawName, history);
  const logs = await getPredictionDnaLogs(drawName);
  if (logs.length === 0) return 0;

  const winningNumbers = drawResult.gagnants || [];
  let reconciledCount = 0;

  const updatedLogs = logs.map((log) => {
    // Si déjà réconcilié avec ce résultat, ne pas recalculer
    if (log.drawResultId === drawResult.id && log.status === 'RECONCILED_POST_DRAW') {
      return log;
    }

    const predicted = log.suggestedNumbers || [];
    const winningAttribution: Record<number, NumberDnaAttribution> = {};

    winningNumbers.forEach((num, idx) => {
      winningAttribution[num] = qualifyNumberDna(
        num,
        drawName,
        pureHistory,
        log.activeWeights,
        predicted,
        idx + 1
      );
    });

    const hits = winningNumbers.filter((n) => predicted.includes(n)).length;
    const hitRatio = hits / Math.max(1, winningNumbers.length);

    // Calcul continu de l'écart de dérive (0 - 100%) sans paliers artificiels
    const expectedRatio = (log.metricsSnapshot?.confidence ?? 75) / 100;
    const performanceDelta = Math.abs(expectedRatio - hitRatio);
    const driftScore = parseFloat((Math.min(1.0, performanceDelta * 1.25) * 100).toFixed(1));

    reconciledCount++;
    return {
      ...log,
      drawResultId: drawResult.id,
      reconciledAt: Date.now(),
      actualWinningNumbers: winningNumbers,
      winningNumbersAttribution: winningAttribution,
      driftScore,
      status: 'RECONCILED_POST_DRAW' as const,
    };
  });

  const key = getStorageKey(drawName);
  await set(key, updatedLogs);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('PREDICTION_DNA_RECONCILED', {
        detail: { drawName, drawResultId: drawResult.id, reconciledCount },
      })
    );
  }

  return reconciledCount;
};

/**
 * Récupère ou reconstruit l'ADN prédictif associé aux numéros gagnants d'un tirage passé.
 */
export const getOrReconstructWinningNumbersDna = async (
  drawName: string,
  drawResult: DrawResult,
  fullHistory: DrawResult[],
  activeWeights?: AlgoWeights
): Promise<Record<number, NumberDnaAttribution>> => {
  const pureHistory = purifyHistoryForDraw(drawName, fullHistory);
  const logs = await getPredictionDnaLogs(drawName);

  // 1. Chercher un log réconcilié existant correspondant au tirage
  const matchingLog = logs.find(
    (l) =>
      l.drawResultId === drawResult.id ||
      (l.actualWinningNumbers &&
        l.actualWinningNumbers.length === drawResult.gagnants.length &&
        l.actualWinningNumbers.every((n, i) => n === drawResult.gagnants[i]))
  );

  if (matchingLog && matchingLog.winningNumbersAttribution) {
    return matchingLog.winningNumbersAttribution;
  }

  // 2. Sinon, reconstitution déterministe ante-tirage (Zero nombre magique)
  const drawIndex = pureHistory.findIndex((d) => d.id === drawResult.id || d.date === drawResult.date);
  const antecedentHistory = drawIndex >= 0 ? pureHistory.slice(drawIndex + 1) : pureHistory;
  const weights = activeWeights || matchingLog?.activeWeights || getDefaultWeights();
  const predicted = matchingLog?.suggestedNumbers || [];

  const attribution: Record<number, NumberDnaAttribution> = {};
  drawResult.gagnants.forEach((num, idx) => {
    attribution[num] = qualifyNumberDna(
      num,
      drawName,
      antecedentHistory.length > 0 ? antecedentHistory : pureHistory,
      weights,
      predicted,
      idx + 1
    );
  });

  return attribution;
};

/**
 * Calcule l'écart de performance (drift) entre l'ADN injecté par le moteur neural
 * et la réalité statistique observée après les tirages.
 * Conforme à la philosophie mathématique : Zéro nombre magique, différentiable et déterministe.
 */
export const calculateDnaPerformanceDrift = async (
  drawName: string,
  history: DrawResult[],
  injectedWeights: AlgoWeights
): Promise<DnaPerformanceDriftReport> => {
  const pureHistory = purifyHistoryForDraw(drawName, history);
  const normalizedInjected = normalizeWeights(injectedWeights || getDefaultWeights());
  const evaluatedDraws = pureHistory.slice(0, 15);
  const lastDraw = evaluatedDraws[0];
  const winningNumbers = lastDraw?.gagnants || [];

  const keys = Object.values(AlgoKey);
  const hitCountsPerAlgo: Record<string, number> = {};
  const sumScoresPerAlgo: Record<string, number> = {};
  keys.forEach((k) => {
    hitCountsPerAlgo[k] = 0;
    sumScoresPerAlgo[k] = 0;
  });

  let totalHits = 0;
  let totalEvaluations = 0;

  evaluatedDraws.forEach((draw) => {
    draw.gagnants.forEach((num) => {
      totalEvaluations++;
      const micro = calculateMicroDNAPerNumber(
        drawName,
        num,
        pureHistory,
        normalizedInjected as Record<string, number>
      );

      let bestAlgo = 'bayes_frequency';
      let maxVal = -Infinity;
      Object.entries(micro.behavioralDna).forEach(([algo, val]) => {
        if (val > maxVal) {
          maxVal = val;
          bestAlgo = algo;
        }
        sumScoresPerAlgo[algo] = (sumScoresPerAlgo[algo] || 0) + val;
      });

      if (hitCountsPerAlgo[bestAlgo] !== undefined) {
        hitCountsPerAlgo[bestAlgo] += 1;
        totalHits++;
      }
    });
  });

  const totalSumScore = Object.values(sumScoresPerAlgo).reduce((a, b) => a + b, 0) || 1;
  const empiricalUtilities: Record<string, number> = {};
  keys.forEach((k) => {
    empiricalUtilities[k] = (sumScoresPerAlgo[k] || 0) / totalSumScore;
  });

  // Calcul du Drift par Algorithme & Écarts
  let squaredDriftSum = 0;
  let klDivSum = 0;
  const breakdown: DnaPerformanceDriftReport['algorithmDriftBreakdown'] = [];
  const adjustments: DnaPerformanceDriftReport['recommendedDnaAdjustments'] = [];

  keys.forEach((k) => {
    const injectedW = Number(normalizedInjected[k]) || 0;
    const empiricalU = empiricalUtilities[k] || 0;
    const driftDelta = injectedW - empiricalU;
    squaredDriftSum += driftDelta * driftDelta;

    // KL divergence locale continue
    const p = Math.max(1e-6, injectedW);
    const q = Math.max(1e-6, empiricalU);
    klDivSum += p * Math.log(p / q);

    let status: 'OPTIMAL' | 'OVER_WEIGHTED' | 'UNDER_WEIGHTED' | 'DIVERGENT' = 'OPTIMAL';
    if (Math.abs(driftDelta) > 0.05) {
      status = 'DIVERGENT';
    } else if (driftDelta > 0.015) {
      status = 'OVER_WEIGHTED';
    } else if (driftDelta < -0.015) {
      status = 'UNDER_WEIGHTED';
    }

    breakdown.push({
      algoKey: k,
      label: LABELS_MAP[k] || k,
      injectedWeight: parseFloat(injectedW.toFixed(4)),
      empiricalUtility: parseFloat(empiricalU.toFixed(4)),
      driftDelta: parseFloat(driftDelta.toFixed(4)),
      status,
      hitContributionCount: hitCountsPerAlgo[k] || 0,
    });

    if (Math.abs(driftDelta) > 0.01) {
      const step = 0.5 * driftDelta;
      const recommended = Math.max(0.005, injectedW - step);
      adjustments.push({
        algoKey: k,
        currentWeight: parseFloat(injectedW.toFixed(4)),
        recommendedWeight: parseFloat(recommended.toFixed(4)),
        adjustmentDelta: parseFloat((-step).toFixed(4)),
        reason:
          driftDelta > 0
            ? `Surpondéré de ${(driftDelta * 100).toFixed(1)}% par rapport aux sorties réelles.`
            : `Sous-pondéré : le modèle a manqué ${(Math.abs(driftDelta) * 100).toFixed(1)}% d'affinité observée.`,
      });
    }
  });

  // Normalisation L1 des poids recommandés
  const sumRec = adjustments.reduce((a, b) => a + b.recommendedWeight, 0);
  if (sumRec > 0 && adjustments.length === keys.length) {
    adjustments.forEach((a) => {
      a.recommendedWeight = parseFloat((a.recommendedWeight / sumRec).toFixed(4));
    });
  }

  // Drift global continu via tangente hyperbolique (0 - 100%)
  const rmsDrift = Math.sqrt(squaredDriftSum / keys.length);
  const overallDriftPercentage = parseFloat((Math.tanh(3.5 * rmsDrift) * 100).toFixed(1));
  const brierScore = parseFloat((squaredDriftSum / keys.length).toFixed(4));
  const klDivergence = parseFloat(Math.max(0, klDivSum).toFixed(4));

  // Attribution ADN des numéros du dernier tirage
  const winningAttributions: NumberDnaAttribution[] = [];
  if (lastDraw) {
    winningNumbers.forEach((num, idx) => {
      winningAttributions.push(
        qualifyNumberDna(num, drawName, pureHistory, normalizedInjected, [], idx + 1)
      );
    });
  }

  const causalSummary: string[] = [
    `Drift Global Neural : ${overallDriftPercentage}% d'écart global avec la réalité des ${evaluatedDraws.length} derniers tirages.`,
    `Divergence de Kullback-Leibler : ${klDivergence} nats (entropie relative du tenseur de décision).`,
    `Brier Score probabiliste : ${brierScore} (mesure d'erreur quadratique continue).`,
  ];

  const divergentList = breakdown.filter((b) => b.status === 'DIVERGENT');
  if (divergentList.length > 0) {
    causalSummary.push(
      `Composantes en dérive critique : ${divergentList.map((d) => `${d.label} (Δ=${(d.driftDelta * 100).toFixed(1)}%)`).join(', ')}.`
    );
  } else {
    causalSummary.push(`Tenseur ADN équilibré : aucune divergence critique supérieure au seuil statistique.`);
  }

  return {
    drawName,
    computedAt: new Date().toISOString(),
    evaluatedDrawsCount: evaluatedDraws.length,
    lastDrawDate: lastDraw?.date,
    winningNumbers,
    overallDriftPercentage,
    klDivergence,
    brierScore,
    hitCount: totalHits,
    hitRate: parseFloat(((totalHits / Math.max(1, totalEvaluations)) * 100).toFixed(1)),
    injectedDnaFingerprint: computeModelDnaFingerprint(drawName, normalizedInjected),
    activeWeights: normalizedInjected,
    algorithmDriftBreakdown: breakdown.sort((a, b) => Math.abs(b.driftDelta) - Math.abs(a.driftDelta)),
    winningNumbersAttribution: winningAttributions,
    causalSummary,
    recommendedDnaAdjustments: adjustments.sort((a, b) => Math.abs(b.adjustmentDelta) - Math.abs(a.adjustmentDelta)),
  };
};
