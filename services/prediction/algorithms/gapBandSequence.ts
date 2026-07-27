import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

/**
 * ANALYSEUR DE TRANSITION DE BANDES D'ÉCARTS (Gap Band Sequence Transition)
 *
 * Répond à un besoin distinct des autres algorithmes d'écart déjà présents dans ce
 * pipeline (`gaps.ts`, `gapSequence.ts`, `gapPatternAnalysis.ts`, `gapCadence.ts`,
 * `gapTrend.ts`, `sequencePattern.ts`) : ceux-ci analysent soit l'écart courant d'UN
 * numéro par rapport à une référence, soit la trajectoire PERSONNELLE de la séquence
 * d'écarts d'un numéro (valeurs continues, jamais discrétisées). Aucun n'examine la
 * SIGNATURE COLLECTIVE d'un tirage entier — la combinaison des tranches d'écart des 5
 * numéros gagnants — ni ne modélise comment cette signature évolue d'un tirage à l'autre.
 *
 * PRINCIPE :
 * 1. Chaque numéro gagnant d'un tirage a, au moment où il sort, un écart (nombre de
 *    tirages depuis sa dernière apparition). On classe cet écart dans une "bande"
 *    (tranche de dizaines : 0-10, 10-20, ... ou tranche de cinq : 0-5, 5-10, ...).
 * 2. Un tirage a donc une "signature de bandes" : l'ensemble des 5 bandes de ses numéros
 *    gagnants (ex : 40-50, 0-10, 10-20, 0-10, 30-40).
 * 3. On construit, sur tout l'historique, une matrice de transition : quand la bande B
 *    est présente dans la signature d'un tirage, quelles bandes apparaissent le plus
 *    souvent dans la signature du tirage SUIVANT ? (chaîne de Markov sur les bandes).
 * 4. À partir de la signature de bandes du DERNIER tirage réel, on projette la
 *    distribution de probabilité des bandes attendues au tirage suivant.
 * 5. Chaque numéro candidat est noté selon que sa bande d'écart ACTUELLE correspond à
 *    une bande fortement projetée. Ce score continu (pas un filtre binaire) s'intègre
 *    ensuite à la pondération de l'ADN algorithmique global comme tout autre algorithme
 *    du pipeline — exactement le mécanisme demandé : sélectionner les numéros dont
 *    l'écart correspond aux bandes projetées, puis laisser l'ADN de poids actuel arbitrer
 *    leur importance finale dans la prédiction.
 *
 * MULTI-RÉSOLUTION : l'analyse est menée en parallèle sur des bandes de largeur 5 ET de
 * largeur 10 (les deux découpages demandés), puis moyennée — un numéro dont la bande est
 * confirmée aux DEUX résolutions reçoit un signal plus fort qu'un accord à une seule
 * résolution, réduisant le risque de faux positif lié à un découpage arbitraire unique.
 *
 * Base mathématique : Chaîne de Markov d'ordre 1 sur bandes d'écarts discrétisées,
 * fusion multi-résolution (largeur 5 et largeur 10).
 */

const DOMAIN_SIZE = 90;
const BAND_WIDTHS = [5, 10] as const;

interface BandTransitionModel {
  bandTransition: Map<number, Map<number, number>>;
  numBands: number;
  lastDrawBands: number[];
  projectedNextBandWeights: Map<number, number>;
  totalTransitionMass: number;
}

const bandOf = (gap: number, width: number, numBands: number): number =>
  Math.min(Math.floor(Math.max(0, gap) / width), numBands - 1);

const buildBandModel = (history: { gagnants?: number[] }[], width: number): BandTransitionModel => {
  const numBands = Math.ceil(DOMAIN_SIZE / width) + 1;
  const bandTransition = new Map<number, Map<number, number>>();

  const chrono = [...history].reverse();
  const lastSeenAtIndex: Record<number, number> = {};

  const bandSignatures: number[][] = [];
  for (let i = 0; i < chrono.length; i++) {
    const draw = chrono[i];
    const signature: number[] = [];
    (draw.gagnants || []).forEach(num => {
      const gap = lastSeenAtIndex[num] !== undefined ? i - lastSeenAtIndex[num] : i;
      signature.push(bandOf(gap, width, numBands));
      lastSeenAtIndex[num] = i;
    });
    bandSignatures.push(signature);
  }

  let totalTransitionMass = 0;
  for (let i = 0; i < bandSignatures.length - 1; i++) {
    const fromBands = bandSignatures[i];
    const toBands = bandSignatures[i + 1];
    fromBands.forEach(fromBand => {
      if (!bandTransition.has(fromBand)) bandTransition.set(fromBand, new Map());
      const row = bandTransition.get(fromBand)!;
      toBands.forEach(toBand => {
        row.set(toBand, (row.get(toBand) || 0) + 1);
        totalTransitionMass++;
      });
    });
  }

  const lastDrawBands = bandSignatures.length > 0 ? bandSignatures[bandSignatures.length - 1] : [];

  const projectedNextBandWeights = new Map<number, number>();
  lastDrawBands.forEach(fromBand => {
    const row = bandTransition.get(fromBand);
    if (!row) return;
    const rowTotal = Array.from(row.values()).reduce((a, b) => a + b, 0);
    if (rowTotal <= 0) return;
    row.forEach((count, toBand) => {
      const prob = count / rowTotal;
      projectedNextBandWeights.set(toBand, (projectedNextBandWeights.get(toBand) || 0) + prob);
    });
  });

  return { bandTransition, numBands, lastDrawBands, projectedNextBandWeights, totalTransitionMass };
};

export const gapBandSequencePlugin: AlgorithmPlugin = {
  key: AlgoKey.GAP_BAND_SEQUENCE,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Chaîne de Markov d\'ordre 1 sur bandes d\'écarts discrétisées (tranches de 5 et de 10), fusion multi-résolution',
  description: 'Projette les tranches d\'écart (dizaines et/ou cinquaines) probables du prochain tirage à partir de la signature de bandes du dernier tirage réel, puis note chaque numéro selon la correspondance entre son écart actuel et ces bandes projetées.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const models = BAND_WIDTHS.map(width => ({ width, model: buildBandModel(ctx.history, width) }));

    const currentGaps: Record<number, number> = {};
    for (let num = 1; num <= DOMAIN_SIZE; num++) {
      let found = -1;
      for (let i = 0; i < ctx.history.length; i++) {
        if (ctx.history[i].gagnants?.includes(num)) { found = i; break; }
      }
      currentGaps[num] = found === -1 ? ctx.history.length : found;
    }

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.GAP_BAND_SEQUENCE] = { models, currentGaps };
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.GAP_BAND_SEQUENCE]) {
      this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.GAP_BAND_SEQUENCE];
    const currentGap = cache.currentGaps[num] ?? 0;

    const slope = 1.0 + (ctx.statisticalBounds?.hurstExponent || 0.5) * 5.0;

    const resolutionScores: number[] = [];
    let totalConfidenceWeight = 0;

    cache.models.forEach(({ width, model }: { width: number; model: BandTransitionModel }) => {
      if (model.totalTransitionMass <= 0 || model.projectedNextBandWeights.size === 0) return;

      const myBand = bandOf(currentGap, width, model.numBands);
      const projectedTotal = Array.from(model.projectedNextBandWeights.values()).reduce((a: number, b: number) => a + b, 0);
      const myBandWeight = model.projectedNextBandWeights.get(myBand) || 0;
      const normalizedWeight = projectedTotal > 0 ? myBandWeight / projectedTotal : 0;

      const equiprobableBaseline = 1.0 / model.numBands;
      const score = 100.0 / (1.0 + Math.exp(-slope * (normalizedWeight - equiprobableBaseline) * model.numBands));
      resolutionScores.push(score);
      totalConfidenceWeight += 1;
    });

    if (resolutionScores.length === 0) {
      return { score: 50, confidence: 0.3, metadata: { hasPattern: false, currentGap } };
    }

    const fusedScore = resolutionScores.reduce((a, b) => a + b, 0) / resolutionScores.length;

    const agreement = resolutionScores.every(s => s >= 50) || resolutionScores.every(s => s < 50)
      ? 1.0
      : 0.5;
    const finalScore = 50 + (fusedScore - 50) * agreement;

    const confidence = Math.max(0.3, Math.min(0.9, 0.3 + 0.3 * agreement + 0.3 * (totalConfidenceWeight / BAND_WIDTHS.length)));

    return {
      score: Math.max(0, Math.min(100, finalScore)),
      confidence,
      metadata: {
        currentGap,
        resolutionScores: resolutionScores.map(s => Number(s.toFixed(2))),
        lastDrawBandSignatures: cache.models.map(({ width, model }: { width: number; model: BandTransitionModel }) => ({ width, bands: model.lastDrawBands }))
      }
    };
  }
};
