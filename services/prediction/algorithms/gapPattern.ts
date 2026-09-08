import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin, AlgorithmContext } from '../algorithmRegistry';
import { evaluateKDE } from '../../kdeService';

/**
 * ANALYSEUR DE MOTIFS DE SÉQUENCES D'ÉCARTS (Gap Pattern Analyzer)
 *
 * Différence avec les algorithmes d'écart existants :
 * - `gaps.ts` applique une loi géométrique THÉORIQUE identique à tous les numéros
 *   (le même modèle pour tout le monde, indépendant de l'historique individuel).
 * - `gapSequence.ts` calcule une distribution EMPIRIQUE mais AGRÉGÉE sur l'ensemble
 *   des 90 numéros (un seul modèle de population, appliqué à chacun).
 * - Celui-ci est IDIOGRAPHIQUE : il analyse la séquence PROPRE de chaque numéro
 *   (la suite chronologique de ses écarts individuels) pour détecter si CE numéro,
 *   spécifiquement, a un rythme propre décelable (auto-corrélation), puis compare
 *   son écart actuel à ce qu'un modèle autorégressif d'ordre 1 (AR(1)) entraîné sur
 *   sa propre histoire prédirait.
 *
 * Base mathématique : Modèle Autorégressif AR(1) par numéro + auto-corrélation de
 * décalage 1 (lag-1) sur la séquence chronologique des écarts individuels.
 */
export const gapPatternPlugin: AlgorithmPlugin = {
  key: AlgoKey.GAP_PATTERN,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Modèle Autorégressif AR(1) par numéro sur séquence d\'écarts individuelle (auto-corrélation de décalage 1)',
  description: 'Détecte, pour chaque numéro individuellement, un motif récurrent dans sa propre séquence chronologique d\'écarts (ex: alternance court/long, ou régularité), puis prédit son écart attendu actuel via un modèle autorégressif entraîné sur son propre historique.',
  isStrictlyDeterministic: true,

  precompute(ctx: AlgorithmContext) {
    const N = 90;
    const history = ctx.history;

    // Nombre minimal d'écarts complets nécessaires pour qu'une estimation d'auto-corrélation
    // soit statistiquement exploitable plutôt que du bruit. 3 écarts = 4 apparitions minimum ;
    // en dessous, la variance d'échantillonnage de la corrélation est trop grande pour être
    // interprétable (ce n'est pas un seuil arbitraire de décision, juste le plancher structurel
    // pour qu'une corrélation lag-1 existe : il faut au moins 2 paires (g[i], g[i+1])).
    const MIN_GAPS_FOR_PATTERN = 3;

    const perNumberAnalysis: Record<number, {
      hasPattern: boolean;
      currentOpenGap: number;
      predictedGap: number;
      scaleForNormalization: number;
      numGaps: number;
      autocorrelation: number;
      meanGap: number;
      variance: number;
    }> = {};

    for (let num = 1; num <= N; num++) {
      // 1. Indices (en nombre de tirages en arrière) de toutes les apparitions du numéro,
      // de la plus récente (index bas) à la plus ancienne (index haut).
      const appearanceIndices: number[] = [];
      for (let i = 0; i < history.length; i++) {
        if (history[i]?.gagnants?.includes(num)) {
          appearanceIndices.push(i);
        }
      }

      const currentOpenGap = appearanceIndices.length > 0 ? appearanceIndices[0] : history.length;

      if (appearanceIndices.length < MIN_GAPS_FOR_PATTERN + 1) {
        // Historique individuel insuffisant : pas de motif exploitable, on le signale
        // explicitement plutôt que d'inventer une valeur.
        perNumberAnalysis[num] = {
          hasPattern: false,
          currentOpenGap,
          predictedGap: 0,
          scaleForNormalization: 1,
          numGaps: 0,
          autocorrelation: 0,
          meanGap: 0,
          variance: 0
        };
        continue;
      }

      // 2. Séquence chronologique des écarts individuels (du plus ancien au plus récent),
      // en inversant l'ordre des apparitions (qui va du plus récent au plus ancien).
      const chronoAppearances = [...appearanceIndices].reverse();
      const gapSeq: number[] = [];
      for (let i = 1; i < chronoAppearances.length; i++) {
        // Différence d'index entre deux apparitions consécutives = nombre de tirages
        // écoulés entre elles (consecutive apparitions result in gap = 0).
        gapSeq.push(chronoAppearances[i - 1] - chronoAppearances[i] - 1);
      }

      const numGaps = gapSeq.length;
      const meanGap = gapSeq.reduce((a, b) => a + b, 0) / numGaps;
      const variance = gapSeq.reduce((a, b) => a + Math.pow(b - meanGap, 2), 0) / numGaps;
      const stdGap = Math.sqrt(variance);

      // 3. Auto-corrélation de décalage 1 (lag-1) : mesure si un écart long tend à être
      // suivi d'un autre écart long (corrélation positive = motif de "régimes" persistants)
      // ou si les écarts courts et longs ont tendance à alterner (corrélation négative).
      let numerator = 0;
      let denominator = 0;
      for (let i = 0; i < numGaps; i++) {
        denominator += Math.pow(gapSeq[i] - meanGap, 2);
        if (i < numGaps - 1) {
          numerator += (gapSeq[i] - meanGap) * (gapSeq[i + 1] - meanGap);
        }
      }
      const autocorrelation = denominator > Number.EPSILON ? numerator / denominator : 0;

      // 4. Prédiction AR(1) : écart attendu = moyenne personnelle + corrélation * écart du
      // dernier écart COMPLET (le plus récent déjà refermé) par rapport à sa propre moyenne.
      const lastCompletedGap = gapSeq[gapSeq.length - 1];
      const predictedGapRaw = meanGap + autocorrelation * (lastCompletedGap - meanGap);
      const predictedGap = Math.max(0, predictedGapRaw);

      // Échelle de normalisation : l'écart-type personnel du numéro, avec un plancher d'un
      // tirage (granularité minimale non-nulle d'un écart, pas une constante arbitraire).
      const scaleForNormalization = Math.max(stdGap, 1.0);

      perNumberAnalysis[num] = {
        hasPattern: true,
        currentOpenGap,
        predictedGap,
        scaleForNormalization,
        numGaps,
        autocorrelation,
        meanGap,
        variance
      };
    }

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.GAP_PATTERN] = { perNumberAnalysis };
  },

  evaluate(num: number, ctx: AlgorithmContext) {
    if (!ctx.pluginCache?.[AlgoKey.GAP_PATTERN]) {
      this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.GAP_PATTERN];
    const analysis = cache.perNumberAnalysis[num];

    if (!analysis || !analysis.hasPattern) {
      // Historique insuffisant pour ce numéro : score neutre, confiance basse plutôt
      // qu'une extrapolation non fondée.
      return {
        score: 50,
        confidence: 0.3,
        metadata: { hasPattern: false }
      };
    }

    const { currentOpenGap, predictedGap, numGaps, autocorrelation, meanGap, variance } = analysis;

    /**
     * CRITICAL IMPROVEMENT: AR(1) Standard Error and Z-score.
     * 1. Calculate Standard Error (SE) of the prediction based on the residuals variance:
     *    SE = sqrt((1 - rho^2) * variance)
     * 2. Compute Z-score:
     *    Z = (currentOpenGap - predictedGap) / SE
     * 3. Base the final score on this normalized Z-score to guarantee the confidence
     *    reflects the model's actual precision for this specific number.
     */
    const rho = autocorrelation;
    const SE = Math.sqrt(Math.max(Number.EPSILON, (1.0 - rho * rho) * variance));
    const zScore = (currentOpenGap - predictedGap) / (SE + Number.EPSILON);

    // Continuous KDE estimation of residual likelihood
    const residualKde = evaluateKDE([predictedGap - SE, predictedGap, predictedGap + SE], currentOpenGap);

    // Sigmoid function mapped to Z-score combined with KDE cumulative density
    const slope = 1.0 + (ctx.statisticalBounds?.hurstExponent || 0.5) * 5.0;
    const parametricScore = 100.0 / (1.0 + Math.exp(-slope * zScore));
    const normalizedScore = 0.70 * parametricScore + 0.30 * (residualKde.cdf * 100.0);

    // La confiance croît avec le nombre d'écarts observés (fiabilité de l'autocorrélation)
    // et décroît lorsque l'erreur de prédiction SE est élevée par rapport à la moyenne.
    const sampleReliability = 1.0 - 1.0 / Math.sqrt(numGaps + 1);
    const predictionPrecision = 1.0 / (1.0 + SE / (meanGap + Number.EPSILON));
    const confidence = Math.max(0.3, Math.min(0.95, 0.3 + 0.65 * sampleReliability * predictionPrecision));

    return {
      score: Math.max(0, Math.min(100, normalizedScore)),
      confidence,
      metadata: {
        hasPattern: true,
        currentOpenGap,
        predictedGap: Number(predictedGap.toFixed(2)),
        personalMeanGap: Number(meanGap.toFixed(2)),
        autocorrelation: Number(autocorrelation.toFixed(3)),
        sampleSize: numGaps,
        standardError: Number(SE.toFixed(3)),
        predictionZScore: Number(zScore.toFixed(3))
      }
    };
  }
};
