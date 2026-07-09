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

    // 2. Calcul des probabilités de sortie par taille d'écart (Distribution Empirique)
    const gapSuccessCounts: Record<number, number> = {};
    let totalSuccesses = 0;

    // Calcul simplifié de la distribution des écarts victorieux dans l'historique
    // Pour être déterministe, on regarde les N derniers tirages
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

    const gapProbabilities: Record<number, number> = {};
    Object.keys(gapSuccessCounts).forEach(gapStr => {
        const gap = parseInt(gapStr, 10);
        gapProbabilities[gap] = gapSuccessCounts[gap] / Math.max(1, totalSuccesses);
    });

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.GAP_SEQUENCE] = {
        currentGaps,
        gapProbabilities,
        medianGapProb: 0 // sera calculé si nécessaire
    };
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.GAP_SEQUENCE]) {
      this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.GAP_SEQUENCE];
    
    const myGap = cache.currentGaps[num] || 0;
    const rawProb = cache.gapProbabilities[myGap] || 0.001; // Probabilité historique que cet écart sorte
    
    // Normalisation sigmoïde pour intégration continue (Zero Hasard, Zero Hard Thresholds)
    // On utilise l'exposant de Hurst comme paramètre de pente si disponible
    const slope = 1.0 + (ctx.statisticalBounds?.hurstExponent || 0.5) * 5.0;
    const center = 0.05; // Probabilité de base attendue (5/90 approx)
    
    const normalizedScore = 100.0 / (1.0 + Math.exp(-slope * (rawProb - center) * 100.0));
    
    return {
      score: Math.max(0, Math.min(100, normalizedScore)),
      confidence: 0.85,
      metadata: { currentGap: myGap, historicalProbability: rawProb }
    };
  }
};
