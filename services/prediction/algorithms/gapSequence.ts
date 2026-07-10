import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

export const gapSequencePlugin: AlgorithmPlugin = {
  key: AlgoKey.GAP_SEQUENCE as any, // Type cast since we just added it to types but TS might lag
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Chaînes de Markov sur les états d\'écart et Affinité Topologique',
  description: 'Évalue les séquences d\'écarts historiques (probabilité qu\'un écart X sorte) et l\'affinité entre les écarts actuels.',
  isStrictlyDeterministic: true,
  
  precompute(ctx) {
    const N = 90;
    // 1. Calcul des écarts actuels
    const currentGaps: Record<number, number> = {};
    for (let i = 1; i <= N; i++) {
        currentGaps[i] = 0;
    }
    
    // Reverse history to find the current gap of each number
    const recentHistory = ctx.history.slice(0, 100); // 100 tirages pour les écarts
    const lastSeen: Record<number, number> = {};
    
    recentHistory.forEach((draw, drawIndex) => {
        (draw.gagnants || []).forEach(num => {
            if (lastSeen[num] === undefined) {
                lastSeen[num] = drawIndex;
            }
        });
    });

    for (let i = 1; i <= N; i++) {
        currentGaps[i] = lastSeen[i] !== undefined ? lastSeen[i] : 100;
    }

    // 2. Calcul de la fonction de répartition cumulative empirique par taille d'écart.
    // CORRECTIF CONCEPTUEL : la version précédente utilisait la probabilité PONCTUELLE
    // qu'un écart de taille exacte G précède un gain (gapSuccessCounts[G] / total). Sous
    // hypothèse de tirages indépendants (loi géométrique), cette quantité décroît TOUJOURS
    // mécaniquement avec G — l'algorithme ne faisait donc que reproduire la décroissance
    // géométrique théorique et favorisait systématiquement les numéros récemment sortis,
    // quel que soit le jeu de données réel ou même sur du bruit aléatoire. Aucune valeur
    // prédictive réelle, et logique diamétralement opposée à l'algorithme `gaps.ts` déjà
    // présent (qui favorise les numéros "en retard" via une CDF géométrique croissante).
    //
    // On utilise maintenant la fonction de répartition CUMULATIVE empirique :
    // P(écart historique menant à un gain <= G), qui croît naturellement avec G — donc plus
    // un numéro est en retard, plus il est probable (empiriquement) qu'un gain survienne
    // "bientôt" au vu de la distribution réelle des écarts observés. Contrairement à `gaps.ts`
    // (loi géométrique théorique pure), on reste ici fondé sur la distribution empirique
    // réellement observée dans l'historique, ce qui capture d'éventuels écarts au modèle
    // théorique (biais physique, dépendances non détectées, etc.).
    const gapSuccessCounts: Record<number, number> = {};
    let totalSuccesses = 0;
    for (let i = 0; i < recentHistory.length - 1; i++) {
        const draw = recentHistory[i];
        const prevDraws = recentHistory.slice(i + 1);
        
        draw.gagnants?.forEach(num => {
            // Find gap of num in prevDraws
            let gap = 0;
            for (let j = 0; j < prevDraws.length; j++) {
                if (prevDraws[j].gagnants?.includes(num)) {
                    break;
                }
                gap++;
            }
            if (!gapSuccessCounts[gap]) gapSuccessCounts[gap] = 0;
            gapSuccessCounts[gap]++;
            totalSuccesses++;
        });
    }

    const maxObservedGap = Object.keys(gapSuccessCounts).reduce((max, g) => Math.max(max, parseInt(g, 10)), 0);
    const cumulativeGapProbabilities: Record<number, number> = {};
    let runningTotal = 0;
    for (let g = 0; g <= maxObservedGap; g++) {
        runningTotal += gapSuccessCounts[g] || 0;
        cumulativeGapProbabilities[g] = totalSuccesses > 0 ? runningTotal / totalSuccesses : 0;
    }

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.GAP_SEQUENCE] = {
        currentGaps,
        cumulativeGapProbabilities,
        maxObservedGap
    };
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.GAP_SEQUENCE]) {
      this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.GAP_SEQUENCE];
    
    const myGap = cache.currentGaps[num] || 0;
    // Au-delà du plus grand écart jamais observé menant à un gain, la CDF empirique sature
    // naturellement à 1.0 (certitude croissante qu'un gain est "dû"), au lieu de retomber sur
    // une valeur arbitraire faible comme dans l'ancienne version.
    const rawProb = myGap >= cache.maxObservedGap
      ? 1.0
      : (cache.cumulativeGapProbabilities[myGap] ?? 0);
    
    // Normalisation sigmoïde pour intégration continue (Zero Hasard, Zero Hard Thresholds)
    // On utilise l'exposant de Hurst comme paramètre de pente si disponible
    const slope = 1.0 + (ctx.statisticalBounds?.hurstExponent || 0.5) * 5.0;
    const center = 0.5; // Centré sur la médiane de la CDF (50% de la masse de probabilité)
    
    const normalizedScore = 100.0 / (1.0 + Math.exp(-slope * (rawProb - center) * 4.0));
    
    return {
      score: Math.max(0, Math.min(100, normalizedScore)),
      confidence: 0.85,
      metadata: { currentGap: myGap, cumulativeProbability: rawProb }
    };
  }
};
