import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin, AlgorithmContext } from '../algorithmRegistry';
import { gapRangeSequenceService } from '../gapRangeSequenceService';

const CACHE_KEY = 'gap_range_sequence_scores';

/**
 * Plugin Algorithmique : Séquences & Patterns des Écarts par Tranches (Markov-Wasserstein)
 *
 * Modélise la dynamique des 7 tranches d'écarts (0, 1–3, 4–7, 8–14, 15–24, 25–39, 40+)
 * via une chaîne de Markov d'ordre 1 & 2 pondérée par gain d'information de Kullback-Leibler,
 * la distance Earth-Mover (1-Wasserstein), et la résonance de hasard individuel de Silverman.
 */
export const gapRangeSequencePlugin: AlgorithmPlugin & {
  execute: (context: { history: AlgorithmContext['history']; drawName?: string }) => {
    scores: Record<number, number>;
  };
} = {
  key: AlgoKey.GAP_BAND_SEQUENCE,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis:
    'Chaînes de Markov d’ordre 1 & 2 pondérées par Divergence KL + Distance 1-Wasserstein + Noyau de Renouvellement de Silverman',
  description:
    'Projette les quotas optimaux de tranches d’écarts (Hamilton-Hare) et départage les 90 boules par leur densité de renouvellement individuel et la continuité Gaussienne aux frontières.',
  isStrictlyDeterministic: true,

  precompute(context: AlgorithmContext): void {
    if (!context.pluginCache) return;
    const drawName = context.drawName || 'ALL';
    const scores = gapRangeSequenceService.getBallScoresFromGapSequences(
      drawName,
      context.history
    );
    const arr = new Float64Array(91);
    let maxVal = 0.0001;
    for (let i = 1; i <= 90; i++) {
      const s = scores[i] ?? 0.2;
      arr[i] = s;
      if (s > maxVal) maxVal = s;
    }
    for (let i = 1; i <= 90; i++) {
      arr[i] = Math.min(1, Math.max(0.05, arr[i] / maxVal));
    }
    context.pluginCache[CACHE_KEY] = arr;
  },

  evaluate(
    num: number,
    context: AlgorithmContext
  ): { score: number; confidence: number } {
    const cached = context.pluginCache?.[CACHE_KEY] as Float64Array | undefined;
    if (!cached || num < 1 || num > 90) {
      return { score: 0.5, confidence: 0.5 };
    }
    const rawScore = cached[num];
    const historyFactor = Math.min(1, context.history.length / 80);
    return {
      score: rawScore,
      confidence: 0.58 + 0.34 * historyFactor,
    };
  },

  execute(context: {
    history: AlgorithmContext['history'];
    drawName?: string;
  }): { scores: Record<number, number> } {
    const scores = gapRangeSequenceService.getBallScoresFromGapSequences(
      context.drawName || 'ALL',
      context.history
    );
    return { scores };
  },
};
