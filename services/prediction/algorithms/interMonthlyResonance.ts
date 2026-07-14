import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

export const interMonthlyResonancePlugin: AlgorithmPlugin = {
  key: AlgoKey.INTER_MONTHLY_RESONANCE,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Coherence Spatio-Temporelle et Loi de Résonance Temporelle Périodique (Calendar Waves)',
  description: 'Analyse la résonance des numéros gagnants et machines des mois précédents (ex: retour de février) en projetant une onde d attraction continue.',
  isStrictlyDeterministic: true,
  precompute(ctx) {
    const history = ctx.history || [];
    if (history.length === 0) {
      ctx.pluginCache = ctx.pluginCache || {};
      ctx.pluginCache[AlgoKey.INTER_MONTHLY_RESONANCE] = { scores: {} };
      return;
    }

    // Déterminer le mois de référence à partir du tirage le plus récent
    let referenceMonth = 1; // Par défaut Février (index 1)
    for (const draw of history) {
      if (draw.date) {
        const d = new Date(draw.date);
        if (!isNaN(d.getTime())) {
          referenceMonth = d.getMonth(); // 0-11
          break;
        }
      }
    }

    // Le mois cible est le mois précédent (ex: si on est en Mars [index 2], le mois cible est Février [index 1])
    const targetMonth = (referenceMonth - 1 + 12) % 12;

    // Filtrer les tirages du mois cible dans l'historique complet
    const targetDraws = history.filter(draw => {
      if (!draw.date) return false;
      const d = new Date(draw.date);
      return !isNaN(d.getTime()) && d.getMonth() === targetMonth;
    });

    const N_target = targetDraws.length || 1;
    // Taux d'amortissement continu basé sur la taille de l'échantillon pour éviter les nombres magiques
    const lambda = 1.0 / N_target;

    const rawResonanceScores: Record<number, number> = {};
    for (let i = 1; i <= 90; i++) {
      rawResonanceScores[i] = 0.0;
    }

    // Calcul cumulatif continu avec décroissance exponentielle du temps
    targetDraws.forEach((draw, index) => {
      const timeDecay = Math.exp(-lambda * index);

      // Traiter les Gagnants
      if (Array.isArray(draw.gagnants)) {
        draw.gagnants.forEach(num => {
          if (num >= 1 && num <= 90) {
            rawResonanceScores[num] += 1.5 * timeDecay;
          }
        });
      }

      // Traiter les Machines (si présentes)
      if (Array.isArray(draw.machine)) {
        draw.machine.forEach(num => {
          if (num >= 1 && num <= 90) {
            rawResonanceScores[num] += 1.0 * timeDecay;
          }
        });
      }
    });

    // Synergie continue (produit d'affinité) si un numéro est sorti à la fois en gagnant et machine dans le mois cible
    targetDraws.forEach((draw) => {
      if (Array.isArray(draw.gagnants) && Array.isArray(draw.machine)) {
        const intersection = draw.gagnants.filter(n => draw.machine?.includes(n));
        intersection.forEach(num => {
          if (num >= 1 && num <= 90) {
            rawResonanceScores[num] *= 1.25; // Boost de symbiose continue
          }
        });
      }
    });

    // Calcul des statistiques d'ensemble pour la sigmoïde de normalisation
    const allValues = Object.values(rawResonanceScores);
    const sorted = [...allValues].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 0;
    const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
    const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
    const iqr = Math.max(1e-6, q3 - q1);

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.INTER_MONTHLY_RESONANCE] = {
      scores: rawResonanceScores,
      median,
      iqr,
      targetMonthName: new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(new Date(2026, targetMonth, 1))
    };
  },
  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.INTER_MONTHLY_RESONANCE]) {
      this.precompute(ctx);
    }

    const cache = ctx.pluginCache![AlgoKey.INTER_MONTHLY_RESONANCE];
    const rawVal = cache.scores[num] || 0.0;
    const median = cache.median;
    const iqr = cache.iqr;

    // Projection sigmoïdale douce pour rester 100% continu et exempt de seuils brusques
    const slope = 1.5 / iqr;
    const normalizedScore = 100.0 / (1.0 + Math.exp(-slope * (rawVal - median)));
    const score = Math.max(0.0, Math.min(100.0, normalizedScore));

    return {
      score,
      confidence: 0.90,
      metadata: {
        rawVal,
        targetMonth: cache.targetMonthName,
      }
    };
  }
};
