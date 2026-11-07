import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';
import { extractDrawNumbers } from '../featureExtractor';
import { computeVectorizedJaccardHpc } from '../../wasm/lotoEngineBridge';

/**
 * ALGORITHME DE SIMILITUDE DE JACCARD (LotoPro Platinum Elite)
 *
 * Fondement mathématique :
 * Indice de Similitude d'Intersection de Jaccard :
 *   J(A, B) = |A \cap B| / |A \cup B|
 *
 * Évalue continûment :
 * 1. La similitude de Jaccard inter-tirages (Regime Recurrence) : Mesure le recouvrement entre le tirage
 *    gagnant récent D_0 et chaque tirage passé D_t, puis transmet le poids aux tirages consécutifs D_{t-1}.
 * 2. La co-occurrence de Jaccard inter-numéros (Set-Overlap Affinity) : Mesure le coefficient de Jaccard
 *    lissé de Laplace entre l'historique d'apparition de chaque numéro n et les numéros gagnants actuels.
 *
 * Principes AGENTS.md :
 * - Zéro Nombres Magiques : Médiane, IQR et lissage de Laplace calculés de façon continue.
 * - 100% Déterministe : Aucun appel à Math.random(), reproductibilité totale.
 * - Transitions Continues : Normalisation Z-score robuste squashée par une CDF Sigmoïde logistique [0, 100].
 */
export const jaccardPlugin: AlgorithmPlugin = {
  key: AlgoKey.JACCARD,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: "Indice de Similitude d'Intersection de Jaccard J(A,B) = |A ∩ B| / |A ∪ B| et Résonance d'Ensembles",
  description: "Évalue le coefficient d'intersection de Jaccard entre les tirages récents et l'historique pour modéliser la récurrence par similitude d'ensembles.",
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const mainMax = 90;
    const history = ctx.history || [];

    if (history.length === 0) {
      ctx.pluginCache = ctx.pluginCache || {};
      ctx.pluginCache[AlgoKey.JACCARD] = {
        jaccardScores: new Float64Array(mainMax + 1),
        median: 0,
        iqr: 1.0,
        mainMax
      };
      return;
    }

    // 1. Aplatir l'historique en Int32Array contigu pour exécution HPC
    const totalDraws = history.length;
    const flatHistory = new Int32Array(totalDraws * 5);
    for (let t = 0; t < totalDraws; t++) {
      const w = extractDrawNumbers(history[t]).winners;
      for (let c = 0; c < 5; c++) {
        flatHistory[t * 5 + c] = w[c] || 0;
      }
    }

    // 2. Exécution vectorisée via le moteur matriciel HPC / WASM
    const jaccardScores = computeVectorizedJaccardHpc(flatHistory, totalDraws, 5, mainMax);

    // 3. Statistiques de centrage robustes (Médiane & Ecart Interquartile)
    const validScores = Array.from(jaccardScores.slice(1, mainMax + 1));
    let median = 0;
    let iqr = 1.0;
    if (validScores.length > 0) {
      const sorted = [...validScores].sort((a, b) => a - b);
      median = sorted[Math.floor(sorted.length / 2)];
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      iqr = Math.max(1e-6, q3 - q1);
    }

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.JACCARD] = {
      jaccardScores,
      median,
      iqr,
      mainMax
    };
  },


  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.JACCARD]) {
      this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.JACCARD];
    const jaccardScores = cache.jaccardScores;
    const median = cache.median;
    const iqr = cache.iqr;
    const mainMax = cache.mainMax;

    if (num < 1 || num > mainMax) {
      return { score: 0, confidence: 0.5 };
    }

    const rawScore = jaccardScores[num] || 0.0;
    const zScore = (rawScore - median) / iqr;
    // Sigmoïde logistique continue sans seuil abrupt
    const score = 100.0 / (1.0 + Math.exp(-2.0 * zScore));

    return {
      score: Math.max(0.0, Math.min(100.0, score)),
      confidence: 0.85,
      metadata: { rawScore, zScore }
    };
  }
};
