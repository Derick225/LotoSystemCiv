import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin, AlgorithmContext } from '../algorithmRegistry';

/**
 * ONDELETTES MULTI-ÉCHELLES & CYCLES PHYSIQUES DE CARNOT (18 TIRAGES)
 *
 * Remplace l'ancien modèle calendaire civil/lunaire par une transformée en ondelettes
 * continues (Ricker Wavelet) calée sur les cycles invariants fondamentaux du loto 5/90 :
 * le temps caractéristique moyen de balayage complet du boulier est T_0 = 90 / 5 = 18 tirages.
 *
 * Principes (AGENTS.md) :
 * 1. Zéro nombre magique : les échelles harmoniques {9, 18, 36, 54, 72} sont les sous-harmoniques
 *    et multiples entiers de T_0 = 90/5.
 * 2. Zéro pseudo-science : aucune référence aux mois civils, saisons ou phases lunaires.
 * 3. Continuité C^infinity : noyau d'ondelette différentiable et projection logistique.
 */
export const interMonthlyResonancePlugin: AlgorithmPlugin = {
  key: AlgoKey.INTER_MONTHLY_RESONANCE,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Transformée en ondelettes continues de Ricker calée sur la période d\'échantillonnage fondamental T_0 = 18 tirages (90/5)',
  description: 'Détecte les interférences constructives et la résonance spectrale multi-résolution aux échelles fondamentales d\'apparition du boulier (18, 36, 54 tirages).',
  isStrictlyDeterministic: true,

  precompute(ctx: AlgorithmContext) {
    const N = 90;
    const history = ctx.history || [];
    const H = Math.min(history.length, 120);

    const scores: Record<number, number> = {};
    const confidences: Record<number, number> = {};
    const waveletCoeffs: Record<number, number> = {};

    if (H < 9) {
      for (let i = 1; i <= N; i++) {
        scores[i] = 50.0;
        confidences[i] = 0.1;
      }
      ctx.pluginCache = ctx.pluginCache || {};
      ctx.pluginCache[AlgoKey.INTER_MONTHLY_RESONANCE] = { scores, confidences, waveletCoeffs };
      return;
    }

    // 1. Échelles physiques du boulier 5/90 (T_0 = 18 tirages)
    const SCALES = [9.0, 18.0, 36.0, 54.0, 72.0];

    // 2. Série temporelle binaire d'apparition x_i(t) pour chaque numéro (t = 0 est le plus récent)
    const presenceGrid = new Uint8Array((N + 1) * H);
    for (let t = 0; t < H; t++) {
      const winners = history[t]?.gagnants || [];
      for (const num of winners) {
        if (num >= 1 && num <= N) {
          presenceGrid[num * H + t] = 1;
        }
      }
    }

    // 3. Convolution en ondelette de Ricker : psi(u) = (1 - u^2) * exp(-u^2 / 2)
    const rawWavelet = new Float64Array(N + 1);

    for (const scale of SCALES) {
      const scaleWeight = 1.0 / Math.sqrt(scale);
      const invScale = 1.0 / scale;

      for (let i = 1; i <= N; i++) {
        let coeff = 0.0;
        const rowOffset = i * H;

        for (let t = 0; t < H; t++) {
          if (presenceGrid[rowOffset + t] === 1) {
            const u = t * invScale;
            const uSq = u * u;
            const psi = (1.0 - uSq) * Math.exp(-0.5 * uSq);
            coeff += psi;
          }
        }

        rawWavelet[i] += scaleWeight * (coeff * Math.sqrt(invScale));
      }
    }

    // 4. Normalisation robuste par Z-score (médiane & MAD)
    const coeffVals: number[] = [];
    for (let i = 1; i <= N; i++) coeffVals.push(rawWavelet[i]);
    coeffVals.sort((a, b) => a - b);

    const medianCoeff = coeffVals[Math.floor(N / 2)];
    const absDevs = coeffVals.map(v => Math.abs(v - medianCoeff)).sort((a, b) => a - b);
    const madCoeff = Math.max(1e-6, absDevs[Math.floor(N / 2)] * 1.4826);

    const sampleConfidence = Math.max(0.1, Math.min(0.95, 1.0 - Math.exp(-H / 36.0)));

    for (let i = 1; i <= N; i++) {
      const z = (rawWavelet[i] - medianCoeff) / madCoeff;
      // Projection sigmoïde C^infinity sur [0, 100]
      const score = 100.0 / (1.0 + Math.exp(-1.702 * z));
      scores[i] = Math.max(0.0, Math.min(100.0, score));
      confidences[i] = sampleConfidence;
      waveletCoeffs[i] = rawWavelet[i];
    }

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.INTER_MONTHLY_RESONANCE] = { scores, confidences, waveletCoeffs };
  },

  evaluate(num: number, ctx: AlgorithmContext) {
    if (!ctx.pluginCache?.[AlgoKey.INTER_MONTHLY_RESONANCE]) {
      this.precompute(ctx);
    }

    const cache = ctx.pluginCache![AlgoKey.INTER_MONTHLY_RESONANCE];
    const score = cache.scores[num] ?? 50.0;
    const confidence = cache.confidences[num] ?? 0.5;
    const coeff = cache.waveletCoeffs?.[num] ?? 0.0;

    return {
      score,
      confidence,
      metadata: {
        waveletEnergy: coeff,
        fundamentalCycle: 18,
        model: 'Multi-Resolution Ricker Wavelet (T0=18)'
      }
    };
  }
};
