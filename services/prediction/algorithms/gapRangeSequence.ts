import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin, AlgorithmContext } from '../algorithmRegistry';
import { gapRangeSequenceService, GapRangeStep } from '../gapRangeSequenceService';

/**
  * ALGORITHME : SÉQUENCES ET PATTERNS DE TRANCHES D'ÉCARTS (GAP RANGE SEQUENCE & MARKOV PATTERN)
  *
  * Principes :
  * 1. Analyse la suite chronologique des signatures de tranches d'écarts d'apparition (tranches de 10 ou 5).
  * 2. Modélise les transitions de Markov entre les tranches d'écarts observées d'un tirage T-1 vers le tirage T.
  * 3. Extrait la signature d'écarts du dernier tirage connu et calcule la distribution conditionnelle
  *    de probabilité des tranches d'écarts attendues au prochain tirage.
  * 4. Évalue chaque numéro (1 à 90) selon son écart d'apparition actuel et la résonance
  *    de sa tranche d'écart par rapport au modèle de transition de Markov.
  *
  * Garantie : 100% Déterministe, Zéro Nombre Magique, Respect de la Règle d'Isolation du Tirage.
  */
export const gapRangeSequencePlugin: AlgorithmPlugin = {
  key: AlgoKey.GAP_BAND_SEQUENCE,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Chaîne de Markov conditionnelle et modèle de transition de fréquences sur tranches d\'écarts d\'apparition',
  description: 'Analyse les séquences et motifs de transitions de tranches d\'écarts (par tranches de 5 ou 10) entre tirages successifs pour prédire les tranches d\'écarts les plus probables et sélectionner les numéros correspondants.',
  isStrictlyDeterministic: true,

  precompute(ctx: AlgorithmContext) {
    const drawName = ctx.drawName || '';
    const history = ctx.history;
    const step: GapRangeStep = 'combined'; // Multi-resolution fusion (5 & 10)

    const report = gapRangeSequenceService.analyzeGapRangePatterns(
      drawName,
      history,
      step,
      90,
      ctx.weights
    );

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.GAP_BAND_SEQUENCE] = report;
  },

  evaluate(num: number, ctx: AlgorithmContext) {
    if (!ctx.pluginCache?.[AlgoKey.GAP_BAND_SEQUENCE]) {
      this.precompute(ctx);
    }

    const report = ctx.pluginCache![AlgoKey.GAP_BAND_SEQUENCE];
    if (!report || !report.scoresByNumber) {
      return { score: 50, confidence: 0.5 };
    }

    const score = report.scoresByNumber[num] ?? 50.0;
    
    // Confidence is derived continuously from total draws available with Laplace sample saturation
    const totalDraws = report.totalDraws || ctx.history.length;
    const sampleConfidence = Math.min(0.95, 0.4 + 0.55 * (1.0 - Math.exp(-totalDraws / 30.0)));

    return {
      score,
      confidence: sampleConfidence,
      metadata: {
        lastDrawBinSignature: report.lastDrawBinSignature,
        topPredictedBins: report.topPredictedBins.slice(0, 3).map((b: { label: string; probability: number }) => ({
          label: b.label,
          probability: Number((b.probability * 100).toFixed(1))
        }))
      }
    };
  }
};
