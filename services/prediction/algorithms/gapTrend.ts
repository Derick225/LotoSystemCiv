import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';
import { calculateShannonEntropy } from '../../mathService';

/**
 * PROJECTEUR DE TENDANCE DES ÉCARTS (Gap Trend Projector)
 *
 * Différence avec les 4 autres algorithmes d'écart déjà présents (`gaps.ts`,
 * `gapSequence.ts`, `gapPatternAnalysis.ts`, `gapCadence.ts`) : tous évaluent l'écart
 * courant par rapport à un niveau de référence (théorique, empirique-population,
 * personnel-moyen, ou régime-collectif). AUCUN ne modélise la TENDANCE de la séquence
 * d'écarts elle-même dans le temps.
 *
 * Celui-ci analyse explicitement la "séquence des écarts des écarts" : pour chaque numéro,
 * on construit sa suite chronologique d'écarts g[1..n], puis sa suite de DIFFÉRENCES
 * PREMIÈRES Δg[i] = g[i+1] - g[i] (l'accélération ou le ralentissement du rythme
 * d'apparition). On ajuste ensuite un modèle de lissage exponentiel double (méthode de
 * Holt) sur g[], qui estime conjointement un niveau lissé (L) et une tendance lissée (T),
 * afin de PROJETER la valeur attendue du PROCHAIN écart : L + T. On compare enfin l'écart
 * actuellement en cours d'écoulement à cette projection, plutôt qu'à une simple moyenne
 * statique.
 *
 * Les paramètres de lissage (alpha, bêta) ne sont jamais fixés arbitrairement : ils sont
 * sélectionnés par recherche en grille, en minimisant l'erreur quadratique de prévision à
 * un pas en échantillon (SSE in-sample) — une pratique standard en analyse de séries
 * temporelles (méthode de Holt-Winters), pas une constante magique choisie au hasard.
 *
 * Base mathématique : Lissage exponentiel double de Holt (niveau + tendance) + analyse des
 * différences premières (accélération) de la séquence d'écarts.
 */
export const gapTrendPlugin: AlgorithmPlugin = {
  key: AlgoKey.GAP_TREND,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Lissage exponentiel double de Holt (niveau + tendance), paramètres optimisés par minimisation du SSE in-sample',
  description: 'Modélise la tendance (accélération/ralentissement) de la séquence chronologique des écarts de chaque numéro, et projette la valeur attendue du prochain écart pour évaluer si le numéro est en avance, à l\'heure, ou en retard sur SA PROPRE trajectoire.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const N = 90;
    const history = ctx.history;

    // Nombre minimal d'écarts complets nécessaire pour ajuster un modèle niveau+tendance
    // de façon non dégénérée (il faut au moins 2 écarts pour initialiser T, et quelques
    // points supplémentaires pour que la recherche en grille SSE soit significative).
    const MIN_GAPS_FOR_TREND = 5;

    // --- MODULATION DYNAMIQUE DE L'AMORTISSEMENT DE LA TENDANCE (Requirement 1) ---
    // On calcule l'entropie de Shannon sur les 10 derniers tirages.
    const localHistory = history.slice(0, Math.min(history.length, 10));
    const localEntropy = calculateShannonEntropy(localHistory).normalized;

    // Plus l'entropie s'effondre (motifs ordonnés), plus maxCoeff augmente (réactivité accrue de Holt).
    // Plus l'entropie est forte (chaos), plus maxCoeff baisse (on lisse fortement pour éviter de sur-réagir au bruit).
    // On utilise un sigmoïde continu différentiable (sans transition de seuil brusque).
    const maxCoeff = 0.05 + 0.90 * (1.0 / (1.0 + Math.exp(5.0 * (localEntropy - 0.7))));

    // On génère ensuite la grille de recherche ALPHA_BETA_GRID de manière continue,
    // de 0.05 jusqu'à maxCoeff.
    const ALPHA_BETA_GRID: number[] = [];
    const GRID_STEPS = 9;
    for (let i = 0; i <= GRID_STEPS; i++) {
      ALPHA_BETA_GRID.push(0.05 + (maxCoeff - 0.05) * (i / GRID_STEPS));
    }

    /** Ajuste un modèle de Holt sur une séquence et retourne (niveau, tendance, SSE). */
    const fitHolt = (seq: number[], alpha: number, beta: number): { level: number; trend: number; sse: number } => {
      let level = seq[0];
      let trend = seq.length > 1 ? seq[1] - seq[0] : 0;
      let sse = 0;
      for (let i = 1; i < seq.length; i++) {
        const forecast = level + trend;
        const error = seq[i] - forecast;
        sse += error * error;
        const prevLevel = level;
        level = alpha * seq[i] + (1 - alpha) * (level + trend);
        trend = beta * (level - prevLevel) + (1 - beta) * trend;
      }
      return { level, trend, sse };
    };

    const perNumberAnalysis: Record<number, {
      hasPattern: boolean;
      currentOpenGap: number;
      projectedNextGap: number;
      volatility: number;
      trendDirection: number; // >0 = écarts qui s'allongent, <0 = écarts qui se raccourcissent
      numGaps: number;
      fitQuality: number; // proportion de variance expliquée par rapport à un modèle naïf
    }> = {};

    for (let num = 1; num <= N; num++) {
      const appearanceIndices: number[] = [];
      for (let i = 0; i < history.length; i++) {
        if (history[i].gagnants?.includes(num)) {
          appearanceIndices.push(i);
        }
      }
      const currentOpenGap = appearanceIndices.length > 0 ? appearanceIndices[0] : history.length;

      if (appearanceIndices.length < MIN_GAPS_FOR_TREND + 1) {
        perNumberAnalysis[num] = {
          hasPattern: false, currentOpenGap, projectedNextGap: 0,
          volatility: 0, trendDirection: 0, numGaps: 0, fitQuality: 0
        };
        continue;
      }

      // Séquence chronologique des écarts (du plus ancien au plus récent)
      const chronoAppearances = [...appearanceIndices].reverse();
      const gapSeq: number[] = [];
      for (let i = 1; i < chronoAppearances.length; i++) {
        gapSeq.push(chronoAppearances[i - 1] - chronoAppearances[i]);
      }

      // Séquence explicite des "écarts des écarts" (différences premières) : révèle si le
      // rythme d'apparition accélère (Δg négatifs dominants) ou ralentit (Δg positifs
      // dominants) d'une occurrence à l'autre.
      const deltaGapSeq: number[] = [];
      for (let i = 1; i < gapSeq.length; i++) {
        deltaGapSeq.push(gapSeq[i] - gapSeq[i - 1]);
      }
      const meanDelta = deltaGapSeq.reduce((a, b) => a + b, 0) / deltaGapSeq.length;
      const volatility = Math.sqrt(
        deltaGapSeq.reduce((a, b) => a + Math.pow(b - meanDelta, 2), 0) / deltaGapSeq.length
      );

      // Recherche en grille du couple (alpha, beta) minimisant le SSE in-sample.
      let best = { level: gapSeq[0], trend: 0, sse: Infinity, alpha: 0.5, beta: 0.5 };
      for (const alpha of ALPHA_BETA_GRID) {
        for (const beta of ALPHA_BETA_GRID) {
          const fit = fitHolt(gapSeq, alpha, beta);
          if (fit.sse < best.sse) {
            best = { ...fit, alpha, beta };
          }
        }
      }

      // Qualité d'ajustement : réduction de variance par rapport à un modèle naïf
      // (prédiction = moyenne constante), analogue à un R² pour série temporelle.
      const meanGap = gapSeq.reduce((a, b) => a + b, 0) / gapSeq.length;
      const naiveSSE = gapSeq.reduce((a, b) => a + Math.pow(b - meanGap, 2), 0);
      const fitQuality = naiveSSE > Number.EPSILON ? Math.max(0, 1 - best.sse / naiveSSE) : 0;

      const projectedNextGap = Math.max(0, best.level + best.trend);

      perNumberAnalysis[num] = {
        hasPattern: true,
        currentOpenGap,
        projectedNextGap,
        volatility,
        trendDirection: best.trend,
        numGaps: gapSeq.length,
        fitQuality
      };
    }

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.GAP_TREND] = { perNumberAnalysis };
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.GAP_TREND]) {
      this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.GAP_TREND];
    const analysis = cache.perNumberAnalysis[num];

    if (!analysis || !analysis.hasPattern) {
      return { score: 50, confidence: 0.3, metadata: { hasPattern: false } };
    }

    const { currentOpenGap, projectedNextGap, volatility, trendDirection, numGaps, fitQuality } = analysis;

    // Échelle de normalisation : la volatilité des différences premières (avec un plancher
    // d'un tirage, granularité minimale non-nulle), pour que l'écart entre l'écart courant
    // et la projection soit jugé relativement au bruit habituel de CE numéro.
    const scale = Math.max(volatility, 1.0);
    const slope = 1.0 + (ctx.statisticalBounds?.hurstExponent || 0.5) * 5.0;

    // Score continu : plus l'écart courant dépasse la projection Holt (niveau + tendance),
    // plus le numéro est considéré "en retard" sur SA propre trajectoire projetée.
    const normalizedScore = 100.0 / (1.0 + Math.exp(-slope * (currentOpenGap - projectedNextGap) / scale));

    // La confiance combine deux facteurs continus : la taille d'échantillon disponible et
    // la qualité d'ajustement du modèle de tendance (fitQuality proche de 0 = la tendance
    // n'explique pas mieux qu'une moyenne constante, donc la projection est peu fiable).
    const sampleReliability = 1.0 - 1.0 / Math.sqrt(numGaps + 1);
    const confidence = Math.max(0.3, Math.min(0.95, 0.3 + 0.4 * sampleReliability + 0.25 * fitQuality));

    // Classification "tranche" purement descriptive (courte / stable / longue), dérivée du
    // sens de la tendance — n'intervient jamais dans le calcul du score, uniquement dans les
    // métadonnées d'explicabilité pour l'utilisateur.
    const trendLabel = trendDirection > 0.5 ? 'allongement' : trendDirection < -0.5 ? 'raccourcissement' : 'stable';

    return {
      score: Math.max(0, Math.min(100, normalizedScore)),
      confidence,
      metadata: {
        currentOpenGap,
        projectedNextGap: Number(projectedNextGap.toFixed(2)),
        trend: trendLabel,
        trendMagnitude: Number(trendDirection.toFixed(3)),
        fitQuality: Number(fitQuality.toFixed(3)),
        sampleSize: numGaps
      }
    };
  }
};
