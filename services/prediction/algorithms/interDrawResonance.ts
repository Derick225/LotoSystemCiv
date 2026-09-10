import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';
import {
  getFamilyPredecessorAndSuccessor,
  getInterDrawFamiliesForDraw,
  getPrimaryInterDrawFamily
} from '../../../constants';
import { getComplement90, getMirrorNumber } from '../../interDrawService';
import { extractDrawNumbers } from '../featureExtractor';

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

    const relation = getFamilyPredecessorAndSuccessor(drawName, family.id);
    if (!relation) {
      scores.fill(50.0);
      ctx.pluginCache = ctx.pluginCache || {};
      ctx.pluginCache[AlgoKey.INTER_DRAW_RESONANCE] = { scores };
      return;
    }

    // Extraction des gagnants de l'historique disponible
    // Pour l'inférence isolée et rapide dans le contexte du modèle :
    // On analyse les transitions internes de l'historique récent
    const history = ctx.history || [];
    const sampleSize = Math.min(history.length, 50);

    // Analyse des numéros sortis au dernier tirage connu pour projeter les transitions
    const latestDraw = history[0];
    const latestWinners = latestDraw ? extractDrawNumbers(latestDraw).winners : [];
    const activeSet = new Set(latestWinners);
    const activeMirrors = new Set(latestWinners.map(getMirrorNumber));
    const activeComplements = new Set(latestWinners.map(getComplement90));

    // Comptage des co-occurrences et décalages temporels consécutifs t -> t+1
    const transitionFreq = new Float32Array(domainMax + 1);
    const repeatFreq = new Float32Array(domainMax + 1);

    for (let h = 0; h < sampleSize - 1; h++) {
      const curr = extractDrawNumbers(history[h]).winners;
      const prev = extractDrawNumbers(history[h + 1]).winners;
      const decay = Math.exp(-h / 15.0);

      for (const p of prev) {
        if (curr.includes(p)) {
          repeatFreq[p] += decay;
        }
        for (const c of curr) {
          transitionFreq[c] += decay * 0.2;
        }
      }
    }

    // Calcul des scores continus
    for (let i = 1; i <= domainMax; i++) {
      let base = 50.0;

      // Report direct (si dans le tirage précédent)
      if (activeSet.has(i)) {
        base += 15.0 + Math.min(repeatFreq[i] * 5.0, 15.0);
      }

      // Résonance harmonique (miroir / complément)
      if (activeMirrors.has(i) && !activeSet.has(i)) {
        base += 8.0;
      }
      if (activeComplements.has(i) && !activeSet.has(i)) {
        base += 7.0;
      }

      // Poids de transition général
      base += Math.min(transitionFreq[i] * 2.0, 10.0);

      scores[i] = Math.min(Math.max(base, 0), 100);
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
    // Normalisation continue [0, 1]
    const normalizedScore = Math.max(0.01, Math.min(0.99, rawScore / 100.0));
    const confidence = Math.min(1.0, 0.5 + Math.abs(normalizedScore - 0.5));
    return {
      score: normalizedScore,
      confidence
    };
  }
};
