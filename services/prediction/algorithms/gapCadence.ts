import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

/**
 * ANALYSEUR DE CADENCE D'ÉCARTS (Gap Cadence Analyzer)
 *
 * Adapté et refondu à partir d'un script d'analyse externe (Python/pandas) fourni par
 * l'utilisateur. L'idée originale la plus intéressante — non redondante avec les
 * algorithmes déjà présents — est conservée et renforcée statistiquement : détecter si le
 * TIRAGE DANS SON ENSEMBLE traverse actuellement une période où beaucoup de numéros
 * "retardataires" reviennent d'un coup ("vague de retour"), et utiliser ce régime collectif
 * pour moduler dynamiquement l'importance donnée à l'écart de CHAQUE numéro individuel.
 *
 * Ce qui a été délibérément écarté du script original, et pourquoi :
 * - L'analyse de "paires fréquentes" (Counter de combinaisons) fait déjà l'objet
 *   d'algorithmes dédiés et plus robustes dans ce pipeline (`affinity.ts`,
 *   `networkCorrelationPlugin` dans `advancedTopology.ts`) — la dupliquer aurait été
 *   redondant.
 * - La construction de combinaison finale (`suggest_next_combination`) utilisait
 *   `np.random.choice` (aléatoire non déterministe, interdit dans ce pipeline) et pouvait
 *   planter si aucun numéro n'atteignait le seuil de retard, ou renvoyer moins de 5 numéros
 *   uniques après déduplication. Ce rôle est de toute façon déjà rempli, de façon bien plus
 *   robuste, par `combinationGenerator.ts` (recuit simulé sur les scores fusionnés de TOUS
 *   les algorithmes) — dupliquer un second système de sélection en parallèle aurait créé
 *   deux sources de vérité concurrentes.
 * - Les seuils arbitraires (écart >= 30, moyenne < 8, etc.) sont remplacés par des bornes
 *   statistiques dérivées des données elles-mêmes (quartiles, règle de Tukey), et la
 *   classification catégorielle (CALM / RETURN WAVE / TRANSITION) est remplacée par une
 *   intensité continue, cohérent avec la politique "zéro seuil binaire" de ce pipeline.
 *
 * Base mathématique : Règle des clôtures de Tukey (Q3 + 1.5×IQR) pour la détection
 * d'écarts statistiquement atypiques, modulant un score de rang percentile.
 */
export const gapCadencePlugin: AlgorithmPlugin = {
  key: AlgoKey.GAP_CADENCE,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Détection de régime collectif via clôtures de Tukey (Q3 + 1.5×IQR) modulant un rang percentile individuel',
  description: 'Détecte si le tirage traverse une phase collective de retour de numéros retardataires, et amplifie ou atténue en continu le signal d\'écart de chaque numéro selon l\'intensité de cette phase.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const history = ctx.history;
    const domainSize = ctx.features.freqMap?.length ? ctx.features.freqMap.length - 1 : 90;
    const drawSize = history[0]?.gagnants?.length || 5;

    // 1. Reconstruction de l'historique complet des écarts "à l'occurrence" (le nombre de
    // tirages écoulés juste avant que CHAQUE numéro gagnant ne ressorte), toutes positions
    // et tous numéros confondus — c'est la distribution POOLÉE (population), à ne pas
    // confondre avec la distribution PAR numéro utilisée dans gapPatternAnalysis.ts.
    const lastSeenAtIndex: Record<number, number> = {};
    const pooledOccurrenceGaps: number[] = [];
    // Parcours du plus ancien vers le plus récent pour construire correctement "gap = temps
    // écoulé depuis la dernière apparition".
    for (let i = history.length - 1; i >= 0; i--) {
      const draw = history[i];
      (draw.gagnants || []).forEach(num => {
        const gap = lastSeenAtIndex[num] !== undefined ? (lastSeenAtIndex[num] - i) : null;
        if (gap !== null && gap > 0) {
          pooledOccurrenceGaps.push(gap);
        }
        lastSeenAtIndex[num] = i;
      });
    }

    // 2. Clôture de Tukey : seuil statistiquement fondé pour qualifier un écart
    // d'"atypiquement long" — pas une constante arbitraire, dérivée de la distribution
    // réelle observée.
    let tukeyUpperFence = domainSize / Math.max(1, drawSize); // repli si historique trop court
    if (pooledOccurrenceGaps.length >= 8) {
      const sorted = [...pooledOccurrenceGaps].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = Math.max(1e-6, q3 - q1);
      tukeyUpperFence = q3 + 1.5 * iqr;
    }

    // 3. Fenêtre "récente" pour évaluer la cadence courante : deux fois le nombre de
    // tirages théoriquement nécessaires pour couvrir une fois tout le domaine (90/5 = 18
    // tirages en moyenne pour voir chaque numéro une fois ; on observe 2 cycles complets
    // pour lisser le bruit court terme). Dérivé de la structure du jeu, pas arbitraire.
    const recentWindowSize = Math.min(history.length, 2 * Math.ceil(domainSize / Math.max(1, drawSize)));

    let recentGapsCount = 0;
    let recentBigReturnsCount = 0;
    const lastSeenForRecent: Record<number, number> = {};
    for (let i = history.length - 1; i >= 0; i--) {
      const draw = history[i];
      const isInRecentWindow = i < recentWindowSize;
      (draw.gagnants || []).forEach(num => {
        const gap = lastSeenForRecent[num] !== undefined ? (lastSeenForRecent[num] - i) : null;
        if (gap !== null && gap > 0 && isInRecentWindow) {
          recentGapsCount++;
          if (gap >= tukeyUpperFence) recentBigReturnsCount++;
        }
        lastSeenForRecent[num] = i;
      });
    }

    // 4. Intensité continue de "vague de retour" dans [0, 1] : proportion des retours
    // récents qui sont statistiquement atypiques. Remplace la classification catégorielle
    // (CALM / RETURN WAVE / TRANSITION) du script original par une valeur continue,
    // directement exploitable comme facteur de modulation.
    const cadenceIntensity = recentGapsCount > 0 ? recentBigReturnsCount / recentGapsCount : 0;

    // Rang percentile de chaque écart possible au sein de la distribution poolée complète,
    // pour situer objectivement l'écart courant d'un numéro par rapport à l'historique réel
    // du tirage (plutôt qu'une CDF théorique universelle).
    const sortedPooled = [...pooledOccurrenceGaps].sort((a, b) => a - b);

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.GAP_CADENCE] = {
      tukeyUpperFence,
      cadenceIntensity,
      sortedPooled,
      recentWindowSize,
      recentBigReturnsCount,
      recentGapsCount
    };
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.GAP_CADENCE]) {
      this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.GAP_CADENCE];
    const currentGap = Number(ctx.features.gapsMap[num]) || 0;

    // Rang percentile empirique de l'écart courant au sein de la distribution poolée
    // observée (recherche binaire manuelle pour rester déterministe et sans dépendance).
    let percentileScore = 50; // repli neutre si aucune donnée poolée disponible
    if (cache.sortedPooled.length > 0) {
      let lo = 0, hi = cache.sortedPooled.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (cache.sortedPooled[mid] <= currentGap) lo = mid + 1; else hi = mid;
      }
      percentileScore = (lo / cache.sortedPooled.length) * 100.0;
    }

    // Modulation par l'intensité de la cadence collective : en phase de "vague de retour"
    // (cadenceIntensity proche de 1), le signal de retard individuel est amplifié ; en phase
    // calme (cadenceIntensity proche de 0), il reste inchangé. Amplification continue et
    // bornée, sans jamais dépasser 100.
    const amplifiedScore = percentileScore * (1.0 + cache.cadenceIntensity);
    const finalScore = Math.max(0, Math.min(100, amplifiedScore));

    return {
      score: finalScore,
      confidence: Math.max(0.4, Math.min(0.9, 0.4 + cache.recentGapsCount / 100)),
      metadata: {
        currentGap,
        percentileScore: Number(percentileScore.toFixed(2)),
        cadenceIntensity: Number(cache.cadenceIntensity.toFixed(3)),
        tukeyUpperFence: Number(cache.tukeyUpperFence.toFixed(2)),
        recentBigReturns: cache.recentBigReturnsCount,
        recentWindowSize: cache.recentWindowSize
      }
    };
  }
};
