import { DrawResult, AlgoWeights } from '../../types';
import { AlgoKey } from '../../shared/prediction.types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { LABELS_MAP } from '../../hooks/useAlgorithmSync';
import { extractFeatures } from '../prediction/featureExtractor';
import { computeAdvancedMetrics } from '../prediction/predictionOrchestrator';
import { algorithmRegistry, AlgorithmContext } from '../prediction/algorithmRegistry';
import { calculateStatisticalBounds } from '../mathService';
import { normalizeWeights } from '../prediction/weightsManager';

export interface GeneAuditMetric {
  key: AlgoKey;
  label: string;
  category: string;
  currentWeight: number;
  recommendedWeight: number;
  weightDelta: number; // current - recommended
  status: 'underweighted' | 'overweighted' | 'optimal';
  historicalHitRateTop5: number;
  historicalHitRateTop10: number;
  meanReciprocalRank: number;
  informationEfficiency: number; // Pearson/Spearman correlation with winning outcomes
  stabilityScore: number; // 1 - coefficient of variation across draws
  resonanceScore: number; // Composite performance score (0-100)
  totalHits: number;
  topRankedCount: number;
}

export interface GenomicAuditReport {
  drawName: string;
  evaluatedDrawsCount: number;
  genomicHarmonyIndex: number; // 0 - 100%
  overallHistoricalEfficiency: number; // 0 - 100%
  dominantGenes: GeneAuditMetric[];
  underweightedGenes: GeneAuditMetric[];
  overweightedGenes: GeneAuditMetric[];
  allGenes: GeneAuditMetric[];
  recommendedWeights: AlgoWeights;
  currentWeights: AlgoWeights;
  categoryPerformance: Record<string, { label: string; meanEfficiency: number; weightShare: number; geneCount: number }>;
  auditTimestamp: string;
}

/**
 * Calculateur d'Audit Génomique Déterministe & Sans Nombres Magiques
 * Évalue la performance historique réelle de chaque algorithme (gène) pour un tirage isolé.
 */
export const runGenomicAudit = async (
  drawName: string,
  rawHistory: DrawResult[],
  currentWeights: AlgoWeights,
  options?: {
    depth?: number;
    onProgress?: (percent: number, status: string) => void;
  }
): Promise<GenomicAuditReport> => {
  const history = purifyHistoryForDraw(drawName, rawHistory);
  const depth = Math.min(options?.depth || 40, history.length);

  if (history.length < 5) {
    throw new Error(`Historique insuffisant pour l'Audit Génomique (minimum 5 tirages, ${history.length} trouvés pour ${drawName}).`);
  }

  const validKeys = Object.values(AlgoKey);
  const evalHistory = history.slice(0, depth);
  const numAlgos = validKeys.length;

  // Trackers d'efficacité par gène
  const geneStats: Record<AlgoKey, {
    hitsTop5: number;
    hitsTop10: number;
    mrrSum: number;
    corrSum: number;
    historyScores: number[];
    topRankedCount: number;
    evalSamples: number;
  }> = {} as any;

  validKeys.forEach((k) => {
    geneStats[k] = {
      hitsTop5: 0,
      hitsTop10: 0,
      mrrSum: 0,
      corrSum: 0,
      historyScores: [],
      topRankedCount: 0,
      evalSamples: 0,
    };
  });

  // Retrospective Walk-Forward sur les tirages réels
  // Pour chaque tirage t, on utilise le sous-historique [t+1 ... fin] pour prédire t
  const maxEvalDraws = Math.max(3, Math.min(depth - 1, 30));

  for (let i = 0; i < maxEvalDraws; i++) {
    if (options?.onProgress) {
      const progress = Math.round(((i + 1) / maxEvalDraws) * 80);
      options.onProgress(progress, `Évaluation génomique : Tirage ${i + 1}/${maxEvalDraws}...`);
    }

    const targetDraw = evalHistory[i];
    const subHistory = evalHistory.slice(i + 1);
    if (subHistory.length < 3) continue;

    const actualWinners = new Set(
      (Array.isArray(targetDraw.gagnants) ? targetDraw.gagnants : [])
        .map(Number)
        .filter((n) => !isNaN(n) && n >= 1 && n <= 90)
    );

    if (actualWinners.size === 0) continue;

    // Contexte d'évaluation
    const features = await extractFeatures(drawName, subHistory);
    const bounds = calculateStatisticalBounds(subHistory);

    const advancedMetrics = await computeAdvancedMetrics(
      subHistory,
      drawName,
      {},
      false,
      undefined
    );

    const context: AlgorithmContext = {
      features,
      advancedMetrics,
      history: subHistory,
      weights: { ...currentWeights },
      algoWeights: { ...currentWeights },
      statisticalBounds: bounds,
      deterministicSeed: new Date(targetDraw.date).getTime(),
      drawName,
      pluginCache: {},
    };

    // Précalcul des plugins
    algorithmRegistry.forEach((plugin) => {
      try {
        if (typeof plugin.precompute === 'function') {
          plugin.precompute(context);
        }
      } catch (e) {
        // Fallback silencieux
      }
    });

    // Évaluation pour chaque numéro (1 à 90) et pour chaque algorithme
    const algoRankings: Record<string, { num: number; score: number }[]> = {};
    validKeys.forEach((k) => {
      algoRankings[k] = [];
    });

    for (let num = 1; num <= 90; num++) {
      algorithmRegistry.forEach((plugin) => {
        if (!validKeys.includes(plugin.key)) return;
        try {
          const res = plugin.evaluate(num, context);
          const score = typeof res.score === 'number' && !isNaN(res.score) ? res.score : 0;
          algoRankings[plugin.key].push({ num, score });
        } catch {
          algoRankings[plugin.key].push({ num, score: 0 });
        }
      });
    }

    // Analyse des rangs pour chaque algorithme
    validKeys.forEach((key) => {
      const ranked = (algoRankings[key] || []).sort((a, b) => b.score - a.score);
      if (ranked.length === 0) return;

      const top5Nums = new Set(ranked.slice(0, 5).map((r) => r.num));
      const top10Nums = new Set(ranked.slice(0, 10).map((r) => r.num));

      let hits5 = 0;
      let hits10 = 0;
      let reciprocalRankSum = 0;

      actualWinners.forEach((w) => {
        if (top5Nums.has(w)) hits5++;
        if (top10Nums.has(w)) hits10++;
        const rankIndex = ranked.findIndex((r) => r.num === w);
        if (rankIndex !== -1) {
          reciprocalRankSum += 1.0 / (rankIndex + 1);
        }
      });

      const avgMrr = reciprocalRankSum / (actualWinners.size || 1);

      // Corrélation continue (Binaire Réel vs Score Normalisé)
      const isWinnerVector: number[] = [];
      const scoreVector: number[] = [];
      ranked.forEach((r) => {
        isWinnerVector.push(actualWinners.has(r.num) ? 1.0 : 0.0);
        scoreVector.push(r.score);
      });

      // Pearson correlation continue
      const meanW = isWinnerVector.reduce((a, b) => a + b, 0) / isWinnerVector.length;
      const meanS = scoreVector.reduce((a, b) => a + b, 0) / scoreVector.length;
      let numCov = 0;
      let varW = 0;
      let varS = 0;

      for (let k = 0; k < isWinnerVector.length; k++) {
        const dw = isWinnerVector[k] - meanW;
        const ds = scoreVector[k] - meanS;
        numCov += dw * ds;
        varW += dw * dw;
        varS += ds * ds;
      }

      const denom = Math.sqrt(varW * varS) || Number.EPSILON;
      const pearson = Math.max(-1.0, Math.min(1.0, numCov / denom));

      const stats = geneStats[key];
      stats.hitsTop5 += hits5;
      stats.hitsTop10 += hits10;
      stats.mrrSum += avgMrr;
      stats.corrSum += pearson;
      stats.historyScores.push(hits5 + avgMrr);
      stats.evalSamples++;

      if (ranked[0] && actualWinners.has(ranked[0].num)) {
        stats.topRankedCount++;
      }
    });
  }

  if (options?.onProgress) {
    options.onProgress(90, "Synthèse statistique des profils d'ADN...");
  }

  // Normalisation continue des poids actuels
  const normalizedCurrent = normalizeWeights(currentWeights);

  // Construction des métriques pour chaque gène
  const rawGeneMetrics: {
    key: AlgoKey;
    label: string;
    category: string;
    currentWeight: number;
    rawEfficiency: number;
    hitRate5: number;
    hitRate10: number;
    mrr: number;
    pearson: number;
    stability: number;
    totalHits: number;
    topRankedCount: number;
  }[] = [];

  validKeys.forEach((key) => {
    const stats = geneStats[key];
    const samples = Math.max(1, stats.evalSamples);
    const hitRate5 = stats.hitsTop5 / (samples * 5); // Proportion de gagnants capturés dans le top 5
    const hitRate10 = stats.hitsTop10 / (samples * 5);
    const mrr = stats.mrrSum / samples;
    const pearson = stats.corrSum / samples;

    // Stabilité (1 - Coeff de variation)
    const scores = stats.historyScores;
    const meanScore = scores.reduce((a, b) => a + b, 0) / (scores.length || 1);
    const variance = scores.reduce((a, b) => a + Math.pow(b - meanScore, 2), 0) / (scores.length || 1);
    const stdDev = Math.sqrt(variance);
    const cv = meanScore > 0 ? stdDev / meanScore : 1.0;
    const stability = Math.max(0.0, Math.min(1.0, 1.0 / (1.0 + cv)));

    // Efficacité combinée continue (Zero nombre magique, pondérée par corrélation, MRR et hit-rate)
    const normalizedPearson = 0.5 * (pearson + 1.0); // Ramené dans [0, 1]
    const rawEfficiency = (hitRate5 * 0.40) + (mrr * 0.30) + (normalizedPearson * 0.20) + (stability * 0.10);

    // Détermination de la catégorie
    let category = "Fréquence & Markov";
    if ([AlgoKey.SPECTRAL, AlgoKey.FRACTAL, AlgoKey.TEMPORAL, AlgoKey.SHADOW_PROBABILITY, AlgoKey.ISOLATION_ANOMALY].includes(key)) {
      category = "Physique & Signal";
    } else if ([AlgoKey.SPATIAL, AlgoKey.AFFINITY, AlgoKey.NETWORK_CORRELATION, AlgoKey.ECHO_STATE, AlgoKey.DERIVED_NEIGHBOR].includes(key)) {
      category = "Topologie & Réseau";
    } else if ([AlgoKey.BAYES].includes(key)) {
      category = "Inférence Probabiliste";
    } else if ([AlgoKey.MACHINE_TRANSFER].includes(key)) {
      category = "Transfert & Machine";
    }

    rawGeneMetrics.push({
      key,
      label: LABELS_MAP[key] || key,
      category,
      currentWeight: normalizedCurrent[key] || (1.0 / numAlgos),
      rawEfficiency,
      hitRate5,
      hitRate10,
      mrr,
      pearson,
      stability,
      totalHits: stats.hitsTop5,
      topRankedCount: stats.topRankedCount,
    });
  });

  // Calcul du vecteur de poids optimal recommandé via Softmax adaptatif
  const meanEff = rawGeneMetrics.reduce((a, b) => a + b.rawEfficiency, 0) / numAlgos;
  const stdEff = Math.sqrt(
    rawGeneMetrics.reduce((a, b) => a + Math.pow(b.rawEfficiency - meanEff, 2), 0) / numAlgos
  ) || Number.EPSILON;

  // Calcul des scores exponentiels Softmax avec température continue dérivée de la variance
  const temperature = Math.max(0.2, Math.min(1.5, stdEff * 3.0));
  const expScores: Record<string, number> = {};
  let sumExp = 0;

  rawGeneMetrics.forEach((g) => {
    const z = (g.rawEfficiency - meanEff) / (stdEff * temperature);
    const expVal = Math.exp(Math.max(-4.0, Math.min(4.0, z)));
    expScores[g.key] = expVal;
    sumExp += expVal;
  });

  const rawRecommendedWeights: Record<string, number> = {};
  rawGeneMetrics.forEach((g) => {
    rawRecommendedWeights[g.key] = expScores[g.key] / sumExp;
  });

  const recommendedWeights = normalizeWeights(rawRecommendedWeights as AlgoWeights);

  // Construction finale des gènes audités
  const allGenes: GeneAuditMetric[] = rawGeneMetrics.map((g) => {
    const recWeight = recommendedWeights[g.key] || (1.0 / numAlgos);
    const delta = g.currentWeight - recWeight;

    // Seuil de statut continu basé sur l'écart-type des poids
    const weightThreshold = (1.0 / numAlgos) * 0.25;
    let status: 'underweighted' | 'overweighted' | 'optimal' = 'optimal';
    if (delta < -weightThreshold) status = 'underweighted';
    else if (delta > weightThreshold) status = 'overweighted';

    // Score de résonance ramené sur [0, 100]
    const resonanceScore = Math.min(100, Math.max(0, Math.round(g.rawEfficiency * 200)));

    return {
      key: g.key,
      label: g.label,
      category: g.category,
      currentWeight: g.currentWeight,
      recommendedWeight: recWeight,
      weightDelta: delta,
      status,
      historicalHitRateTop5: g.hitRate5,
      historicalHitRateTop10: g.hitRate10,
      meanReciprocalRank: g.mrr,
      informationEfficiency: g.pearson,
      stabilityScore: g.stability,
      resonanceScore,
      totalHits: g.totalHits,
      topRankedCount: g.topRankedCount,
    };
  });

  // Tri par efficacité décroissante
  allGenes.sort((a, b) => b.resonanceScore - a.resonanceScore);

  const dominantGenes = allGenes.slice(0, 5);
  const underweightedGenes = allGenes.filter((g) => g.status === 'underweighted').sort((a, b) => a.weightDelta - b.weightDelta);
  const overweightedGenes = allGenes.filter((g) => g.status === 'overweighted').sort((a, b) => b.weightDelta - a.weightDelta);

  // Indice d'Harmonie Génomique (IHG) : Distance L1 entre poids actuels et recommandés
  let l1DiffSum = 0;
  allGenes.forEach((g) => {
    l1DiffSum += Math.abs(g.currentWeight - g.recommendedWeight);
  });
  const genomicHarmonyIndex = Math.max(0, Math.min(100, Math.round((1.0 - (l1DiffSum / 2.0)) * 100)));

  // Performance par catégorie
  const categoryMap: Record<string, { label: string; effSum: number; weightSum: number; count: number }> = {};
  allGenes.forEach((g) => {
    if (!categoryMap[g.category]) {
      categoryMap[g.category] = { label: g.category, effSum: 0, weightSum: 0, count: 0 };
    }
    categoryMap[g.category].effSum += g.resonanceScore;
    categoryMap[g.category].weightSum += g.currentWeight;
    categoryMap[g.category].count++;
  });

  const categoryPerformance: Record<string, { label: string; meanEfficiency: number; weightShare: number; geneCount: number }> = {};
  Object.entries(categoryMap).forEach(([catKey, cat]) => {
    categoryPerformance[catKey] = {
      label: cat.label,
      meanEfficiency: Math.round(cat.effSum / (cat.count || 1)),
      weightShare: cat.weightSum,
      geneCount: cat.count,
    };
  });

  const overallHistoricalEfficiency = Math.round(
    allGenes.reduce((acc, g) => acc + g.resonanceScore * g.currentWeight, 0)
  );

  return {
    drawName,
    evaluatedDrawsCount: maxEvalDraws,
    genomicHarmonyIndex,
    overallHistoricalEfficiency,
    dominantGenes,
    underweightedGenes,
    overweightedGenes,
    allGenes,
    recommendedWeights,
    currentWeights: normalizedCurrent,
    categoryPerformance,
    auditTimestamp: new Date().toISOString(),
  };
};
