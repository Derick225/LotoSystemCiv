import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';
import {
  getInterDrawFamiliesForDraw,
  getPrimaryInterDrawFamily
} from '../../../constants';
import { calculateInterDrawVector } from '../../interDrawService';

export const interDrawResonancePlugin: AlgorithmPlugin = {
  key: AlgoKey.INTER_DRAW_RESONANCE,
  category: 'core',
  stability: 'stable',
  mathematicalBasis: 'Résonance Stochastique & Transition Markov Inter-Tirages (Familles Étanches)',
  description: 'Évalue les transitions markoviennes et le report direct carry-over depuis le tirage prédécesseur au sein de la famille active.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const scores = new Float32Array(91);
    const domainMax = 90;

    const drawName = ctx.drawName;
    const families = getInterDrawFamiliesForDraw(drawName);
    const family = families.length > 0 ? families[0] : getPrimaryInterDrawFamily(drawName);

    // Si le tirage n'appartient à aucune famille (ou tirage combiné "all"), distribution neutre
    if (!family || !drawName || drawName === 'all' || drawName === 'all combined') {
      scores.fill(50.0);
      ctx.pluginCache = ctx.pluginCache || {};
      ctx.pluginCache[AlgoKey.INTER_DRAW_RESONANCE] = { scores };
      return;
    }

    // 1. Exploitation directe du vecteur pré-extrait via Float32Array zéro-copie si disponible
    if (ctx.features?.interDrawMap && ctx.features.interDrawMap.length > domainMax) {
      for (let i = 1; i <= domainMax; i++) {
        scores[i] = Math.min(100.0, Math.max(0.0, (ctx.features.interDrawMap[i] || 0.0555) * 100.0));
      }
      ctx.pluginCache = ctx.pluginCache || {};
      ctx.pluginCache[AlgoKey.INTER_DRAW_RESONANCE] = { scores };
      return;
    }

    // 2. Calcul vectoriel continu conforme aux règles d'étanchéité et zéro nombre magique
    const interVec = calculateInterDrawVector(ctx.history || [], drawName);
    for (let i = 1; i <= domainMax; i++) {
      scores[i] = Math.min(100.0, Math.max(0.0, (interVec[i] || 0.0555) * 100.0));
    }

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.INTER_DRAW_RESONANCE] = { scores };
  },

  evaluate(num: number, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.INTER_DRAW_RESONANCE]) {
      return { score: 0.5, confidence: 0.5 };
    }
    const cache = ctx.pluginCache[AlgoKey.INTER_DRAW_RESONANCE] as { scores: Float32Array };
    const rawScore = cache.scores[num] ?? 50.0;
    // Normalisation continue [0.01, 0.99]
    const normalizedScore = Math.max(0.01, Math.min(0.99, rawScore / 100.0));
    // Confiance continue basée sur l'écart à l'espérance uniforme (50)
    const confidence = Math.min(1.0, 0.5 + Math.abs(normalizedScore - 0.5));
    return {
      score: normalizedScore,
      confidence
    };
  }
};

