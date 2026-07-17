import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin, AlgorithmContext } from '../algorithmRegistry';
import { LOTTERY_CONSTANTS } from '../../lotteryService';

// Utilitaires de parsing de date pures et déterministes
const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  
  // Format DD/MM/YYYY
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(year, month - 1, day);
  }
  
  // Format ISO
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

// Trouver le tirage jumeau d'une année passée de façon flexible et robuste
const findTwinDraw = (history: any[], currentDate: Date, yearsAgo: number): { draw: any; index: number } | null => {
  const targetMonth = currentDate.getMonth();
  const targetDay = currentDate.getDate();
  const targetYear = currentDate.getFullYear() - yearsAgo;
  
  // Fenêtre adaptative de recherche (tolérance temporelle de ± 3 jours)
  const toleranceDays = 3;
  
  for (let i = 1; i < history.length; i++) {
    const draw = history[i];
    const drawDate = parseDate(draw.date);
    if (!drawDate) continue;
    
    const drawMonth = drawDate.getMonth();
    const drawDay = drawDate.getDate();
    const drawYear = drawDate.getFullYear();
    
    // Vérifier si c'est la même période (mois et jour ± tolérance, année cible)
    if (drawYear === targetYear && drawMonth === targetMonth) {
      const dayDiff = Math.abs(drawDay - targetDay);
      if (dayDiff <= toleranceDays) {
        return { draw, index: i };
      }
    }
  }
  
  return null;
};

/**
 * RÉTRO-INGÉNIERIE TEMPORELLE DE COUPLAGE (Couplet & Triplet Temporal Reverse Engineering)
 * 
 * ALGORITHME CYBERNÉTIQUE DE PROJECTION :
 * 1. Identifier le tirage "jumeau" de l'année passée (Y-1, avec Y-2 en repli) de la même période calendaire.
 * 2. Analyser l'historique antérieur à ce jumeau pour trouver les "périodes sources" d'où proviennent
 *    les combinaisons (couplets, triplets, etc., soit un chevauchement >= 2 numéros) du jumeau.
 * 3. Noter la distance relative 'k' de ces sources par rapport au jumeau.
 * 4. "Répertorier ces périodes correspondant au tirage du jour" : projeter ces mêmes distances 'k'
 *    sur le tirage actuel (index 0), ce qui donne les tirages correspondants aux indices 'k'.
 * 5. Collecter tous les numéros (gagnants et machines) de ces périodes projétées d'aujourd'hui,
 *    puis leur attribuer des scores continus pondérés par l'importance de la combinaison (overlap)
 *    et amortis selon l'exposant de Hurst (Zéro Nombre Magique).
 */
export const interMonthlyResonancePlugin: AlgorithmPlugin = {
  key: AlgoKey.INTER_MONTHLY_RESONANCE,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Rétro-ingénierie Temporelle et Projection Symétrique de Périodes de Couplage',
  description: 'Analyse d\'où proviennent les couplets et triplets du tirage jumeau de l\'année passée, puis projette ces mêmes périodes sources sur le tirage du jour pour en récolter les numéros candidats.',
  isStrictlyDeterministic: true,

  precompute(ctx: AlgorithmContext) {
    const history = ctx.history || [];
    ctx.pluginCache = ctx.pluginCache || {};

    const defaultCache = {
      scores: {},
      median: 0.0,
      iqr: 1.0,
      twinDrawDate: 'N/A',
      periodsAnalyzed: 0,
      totalProjectedNumbers: 0
    };

    if (history.length < 30) {
      ctx.pluginCache[AlgoKey.INTER_MONTHLY_RESONANCE] = defaultCache;
      return;
    }

    const currentDraw = history[0];
    const currentDate = parseDate(currentDraw.date);
    if (!currentDate) {
      ctx.pluginCache[AlgoKey.INTER_MONTHLY_RESONANCE] = defaultCache;
      return;
    }

    // Trouver le tirage jumeau de l'année passée (Y-1) ou de repli (Y-2)
    let twinRes = findTwinDraw(history, currentDate, 1);
    if (!twinRes) {
      twinRes = findTwinDraw(history, currentDate, 2);
    }

    if (!twinRes) {
      ctx.pluginCache[AlgoKey.INTER_MONTHLY_RESONANCE] = defaultCache;
      return;
    }

    const { draw: twinDraw, index: twinIndex } = twinRes;
    const twinNumbers = new Set<number>([
      ...(twinDraw.gagnants || []),
      ...(twinDraw.machine || [])
    ]);

    // Extraction de l'exposant de Hurst pour l'amortissement temporel (Zéro Nombre Magique)
    let hurst = ctx.statisticalBounds?.hurstExponent;
    if (hurst === undefined || isNaN(hurst)) {
      hurst = 0.5;
    }
    const DECAY_GAMMA = 0.05 / (Math.max(0.1, hurst) * 2.0); // Décroissance exponentielle continue

    const rawResonanceScores: Record<number, number> = {};
    for (let i = 1; i <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; i++) {
      rawResonanceScores[i] = 0.0;
    }

    let periodsAnalyzed = 0;
    let totalProjectedNumbers = 0;

    // On parcourt l'historique plus ancien que le tirage jumeau (distance k)
    const maxLookback = Math.min(150, history.length - twinIndex - 1);

    for (let k = 1; k <= maxLookback; k++) {
      const pastDrawIdx = twinIndex + k;
      const pastDraw = history[pastDrawIdx];
      if (!pastDraw) continue;

      const pastDrawNumbers = [
        ...(pastDraw.gagnants || []),
        ...(pastDraw.machine || [])
      ];

      // Compter le chevauchement (combien de numéros du jumeau proviennent de ce tirage historique ?)
      const intersection = pastDrawNumbers.filter(num => twinNumbers.has(num));
      const overlapCount = intersection.length;

      // On cible spécifiquement les couplages (couplets, triplets, quadruplets, etc. => overlapCount >= 2)
      if (overlapCount >= 2) {
        // Le tirage correspondant pour aujourd'hui (à la même distance relative k de l'actuel)
        const currentCorrespondingDraw = history[k];
        if (currentCorrespondingDraw) {
          periodsAnalyzed++;

          // Poids proportionnel à la taille de la combinaison (quadratique) et décroissant avec k
          const combinationWeight = Math.pow(overlapCount, 2.0);
          const timeAmortization = Math.exp(-DECAY_GAMMA * k);
          const periodWeight = combinationWeight * timeAmortization;

          // Récupérer tous les numéros du tirage projeté actuel
          if (Array.isArray(currentCorrespondingDraw.gagnants)) {
            currentCorrespondingDraw.gagnants.forEach(num => {
              if (num >= 1 && num <= LOTTERY_CONSTANTS.TOTAL_NUMBERS) {
                rawResonanceScores[num] += periodWeight * 1.0;
                totalProjectedNumbers++;
              }
            });
          }

          if (Array.isArray(currentCorrespondingDraw.machine)) {
            currentCorrespondingDraw.machine.forEach(num => {
              if (num >= 1 && num <= LOTTERY_CONSTANTS.TOTAL_NUMBERS) {
                rawResonanceScores[num] += periodWeight * 0.5;
                totalProjectedNumbers++;
              }
            });
          }
        }
      }
    }

    // Normalisation Robuste via Interquartile Range (IQR) pour éradiquer les sauts brusques
    const allValues = Object.values(rawResonanceScores);
    const sorted = [...allValues].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 0.0;
    const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0.0;
    const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0.0;
    const rawIqr = q3 - q1;
    const iqr = isNaN(rawIqr) || rawIqr <= 1e-9 ? 1.0 : rawIqr;

    ctx.pluginCache[AlgoKey.INTER_MONTHLY_RESONANCE] = {
      scores: rawResonanceScores,
      median,
      iqr,
      twinDrawDate: twinDraw.date,
      periodsAnalyzed,
      totalProjectedNumbers
    };
  },

  evaluate(num: number, ctx: AlgorithmContext) {
    if (!ctx.pluginCache?.[AlgoKey.INTER_MONTHLY_RESONANCE]) {
      this.precompute(ctx);
    }

    const cache = ctx.pluginCache![AlgoKey.INTER_MONTHLY_RESONANCE];
    const rawVal = isNaN(cache.scores[num]) || cache.scores[num] === undefined ? 0.0 : cache.scores[num];
    const median = isNaN(cache.median) || cache.median === undefined ? 0.0 : cache.median;
    const iqr = isNaN(cache.iqr) || cache.iqr === undefined || cache.iqr <= 1e-9 ? 1.0 : cache.iqr;

    // Fonction sigmoïde douce d'activation continue basée sur l'IQR
    const slope = 1.5 / iqr;
    const exponent = -slope * (rawVal - median);
    
    // Protection contre les débordements exponentiels ou NaN
    let normalizedScore = 50.0;
    if (!isNaN(exponent)) {
      normalizedScore = 100.0 / (1.0 + Math.exp(Math.max(-100, Math.min(100, exponent))));
    }
    
    let score = Math.max(0.0, Math.min(100.0, normalizedScore));
    if (isNaN(score) || !isFinite(score)) {
      score = 0.0;
    }

    // Confiance continue basée sur le volume de périodes d'échos analysées
    const periodsCount = cache.periodsAnalyzed ?? 0;
    const confidence = 0.5 + 0.4 * (1.0 / (1.0 + Math.exp(-(periodsCount - 5.0))));

    return {
      score,
      confidence: isNaN(confidence) || !isFinite(confidence) ? 0.5 : confidence,
      metadata: {
        rawVal,
        twinDrawDate: cache.twinDrawDate,
        periodsAnalyzed: periodsCount,
        totalProjectedNumbers: cache.totalProjectedNumbers ?? 0
      }
    };
  }
};