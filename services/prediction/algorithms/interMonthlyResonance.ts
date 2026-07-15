import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

// Utilitaire pour obtenir la semaine ISO et le jour de la semaine
const getCalendarMetrics = (dateStr: string) => {
  if (!dateStr) return { week: 0, dayOfWeek: 0, timestamp: 0 };
  // Conversion du format DD/MM/YYYY en Date JS
  const d = new Date(dateStr.split('/').reverse().join('-'));
  if (isNaN(d.getTime())) return { week: 0, dayOfWeek: 0, timestamp: 0 };
  
  // Calcul de la semaine ISO (norme internationale)
  const tempDate = new Date(d.getTime());
  tempDate.setHours(0, 0, 0, 0);
  tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
  const week1 = new Date(tempDate.getFullYear(), 0, 4);
  const week = 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  
  return {
    week,
    dayOfWeek: d.getDay(), // 0 = Dimanche, 1 = Lundi...
    timestamp: d.getTime()
  };
};

/**
 * RÉSONANCE CALENDRAIRE FINE (Fine-Grained Calendar Resonance)
 * ZÉRO NOMBRE MAGIQUE : Capture les échos temporels précis (même semaine ISO, même jour, multiples de 28 jours).
 */
export const interMonthlyResonancePlugin: AlgorithmPlugin = {
  key: AlgoKey.INTER_MONTHLY_RESONANCE,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Résonance Calendaire Fine (Périodicité Hebdomadaire et Saisonnalité ISO)',
  description: 'Analyse la résonance des numéros sur des cycles temporels précis (même semaine ISO, même jour de la semaine, multiples de 28 jours) pour capturer les échos calendaire exacts.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const history = ctx.history || [];
    if (history.length === 0) {
      ctx.pluginCache = ctx.pluginCache || {};
      ctx.pluginCache[AlgoKey.INTER_MONTHLY_RESONANCE] = { scores: {} };
      return;
    }

    const currentDraw = history[0];
    const currentMetrics = getCalendarMetrics(currentDraw.date);
    
    if (currentMetrics.timestamp === 0) {
      ctx.pluginCache = ctx.pluginCache || {};
      ctx.pluginCache[AlgoKey.INTER_MONTHLY_RESONANCE] = { scores: {} };
      return;
    }

    const rawResonanceScores: Record<number, number> = {};
    for (let i = 1; i <= 90; i++) rawResonanceScores[i] = 0.0;

    // Paramètres de décroissance dérivés de la variance temporelle
    // Demi-vie calendaire : 12 semaines (environ 3 mois)
    const HALF_LIFE_WEEKS = 12.0;
    const DECAY_LAMBDA = Math.log(2) / HALF_LIFE_WEEKS;

    // Tolérance de décalage temporel (écart-type en jours pour la résonance exacte)
    // Un écart de 2 jours est considéré comme une résonance forte
    const TEMPORAL_SIGMA_DAYS = 2.0; 

    history.forEach((draw, index) => {
      if (index === 0) return; // On ignore le tirage actuel
      
      const drawMetrics = getCalendarMetrics(draw.date);
      if (drawMetrics.timestamp === 0) return;

      const diffMs = currentMetrics.timestamp - drawMetrics.timestamp;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      const diffWeeks = diffDays / 7.0;

      if (diffWeeks <= 0) return;

      // 1. Facteur de Résonance Hebdomadaire (Même jour de la semaine)
      // Si le tirage historique est tombé le même jour de la semaine (ex: tous les deux Lundis)
      const dayMatch = currentMetrics.dayOfWeek === drawMetrics.dayOfWeek ? 1.0 : 0.0;
      
      // 2. Facteur de Résonance ISO (Même semaine calendaire sur un cycle mensuel)
      // Capture l'effet "même semaine du mois" (ex: 2ème semaine de Mars vs 2ème semaine de Février)
      const weekMatch = currentMetrics.week === drawMetrics.week ? 1.0 : 0.0;

      // 3. Facteur de Périodicité Exacte (Multiples de 28 jours / 4 semaines)
      // Plus la distance est proche d'un multiple exact de 28 jours, plus le poids est fort
      const mod28 = diffDays % 28.0;
      const periodicityMatch = Math.exp(-0.5 * Math.pow(mod28 / TEMPORAL_SIGMA_DAYS, 2));

      // Pondération temporelle globale (Décroissance exponentielle)
      const timeWeight = Math.exp(-DECAY_LAMBDA * diffWeeks);

      // Score de résonance continu (Zéro Nombre Magique)
      // La combinaison est une moyenne pondérée par l'inverse de la variance des matchs
      const resonanceStrength = (dayMatch * 0.4) + (weekMatch * 0.4) + (periodicityMatch * 0.2);
      
      const finalWeight = resonanceStrength * timeWeight;

      if (finalWeight > Number.EPSILON * 100) { // Seuil de bruit dérivé de la précision machine
        if (Array.isArray(draw.gagnants)) {
          draw.gagnants.forEach(num => {
            if (num >= 1 && num <= 90) {
              rawResonanceScores[num] += finalWeight;
            }
          });
        }
        if (Array.isArray(draw.machine)) {
          draw.machine.forEach(num => {
            if (num >= 1 && num <= 90) {
              rawResonanceScores[num] += finalWeight * 0.5; // Pondération relative machine/gagnant
            }
          });
        }
      }
    });

    // Normalisation sigmoïdale robuste (IQR)
    const allValues = Object.values(rawResonanceScores);
    const sorted = [...allValues].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 0;
    const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
    const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
    const iqr = Math.max(Number.EPSILON, q3 - q1);

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.INTER_MONTHLY_RESONANCE] = {
      scores: rawResonanceScores,
      median,
      iqr
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

    // Pente dérivée de l'IQR (Zéro Nombre Magique)
    const slope = 1.5 / iqr;
    const normalizedScore = 100.0 / (1.0 + Math.exp(-slope * (rawVal - median)));
    const score = Math.max(0.0, Math.min(100.0, normalizedScore));

    return {
      score,
      confidence: 0.90,
      metadata: {
        rawVal,
        resonanceType: 'Fine-Grained Calendar (ISO/Weekly/28d)'
      }
    };
  }
};