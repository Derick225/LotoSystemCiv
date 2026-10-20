/**
 * Attribution Causale de Canaux par Contrefactuel Continu (AGENTS.md)
 *
 * Transforme l'autopsie descriptive en autopsie causale :
 * 1. Attribution additive EXACTE : la fusion d'ensemble est linéaire
 *    (e_n = Σ_k w_k · s_kn), donc la contribution du canal k au score de
 *    n'importe quel sous-ensemble de numéros est exactement Σ w_k · s_kn.
 * 2. Contrefactuel Leave-One-Out CONTINU, deux variantes sans seuil binaire :
 *    - Ablation   : w_k → 0, les autres poids inchangés.
 *    - Réallocation : masse w_k redistribuée aux canaux restants par
 *      renormalisation continue w_j / (1 - w_k).
 *    Pour chaque variante, le Top-5 est re-classé et les métriques
 *    (hits, Brier, entropie croisée, calibration) sont recalculées avec
 *    les formules exactes de l'autopsie → Δ causaux par canal.
 * 3. Score d'importance causal : z-scores standardisés des Δ (écart-type
 *    population observé sur les canaux, aucune constante fixe) combinés
 *    par softmax continue. 100% déterministe, zéro PRNG.
 *
 * Zéro donnée synthétique : si l'ensemble est dégénéré (somme nulle),
 * la distribution uniforme exacte est utilisée, comme dans l'autopsie.
 */

export interface ChannelAttributionInput {
  /** Clés des canaux dans l'ordre déterministe de l'appelant (Object.values(AlgoKey)) */
  channelKeys: string[];
  /** Scores bruts par canal, indexés 1..90, valeurs dans [0, 1] */
  algoScores: Record<string, Float32Array>;
  /** Poids normalisés de l'ensemble (somme = 1) au moment t-1 */
  weights: Record<string, number>;
  /** Gagnants réels du tirage cible */
  actualWinners: number[];
  /** Top-5 prononcé par le modèle complet */
  top5Predicted: number[];
  /** Libellés humains des canaux (injectés par l'appelant pour garder ce module pur) */
  labels?: Record<string, string>;
}

export interface ChannelCounterfactualImpact {
  key: string;
  label: string;
  weight: number;
  /** Part exacte du canal dans le score d'ensemble du Top-5 (Σ w_k s_kn / Σ e_n) */
  additiveShareTop5: number;
  /** Part exacte du canal dans le score d'ensemble des gagnants réels */
  additiveShareWinners: number;
  /** Δhits Top-5 (complet moins ablation w_k→0). Positif = le canal a causé des hits */
  deltaHitsTop5Ablation: number;
  /** ΔBrier (ablation moins complet). Positif = le canal a réduit l'erreur quadratique */
  deltaBrierAblation: number;
  /** Δentropie croisée (ablation moins complet). Positif = le canal a réduit la surprise */
  deltaCrossEntropyAblation: number;
  /** Δcalibration % (ablation moins complet). Positif = le canal a amélioré la calibration */
  deltaCalibrationAblation: number;
  /** Δhits Top-5 sous réallocation continue de la masse w_k (contre-factuel moins complet) */
  deltaHitsTop5Reallocation: number;
  /** ΔBrier sous réallocation continue (contre-factuel moins complet) */
  deltaBrierReallocation: number;
  /** Softmax des z-scores composites des Δ — importance causale relative dans ]0,1[ */
  causalImportanceScore: number;
  /** Rang causal (1 = plus grand contributeur), ex aequo départagés par clé */
  causalRank: number;
  /** Récit déterministe fondé uniquement sur les grandeurs mesurées */
  narrative: string;
}

interface EnsembleOutcome {
  top5: number[];
  hitsTop5: number;
  brier: number;
  crossEntropy: number;
  calibration: number;
}

const TOTAL_NUMBERS = 90;
const DRAW_SIZE = 5;
const FLOAT_GUARD = 1e-12;
/**
 * Recalcule le résultat d'ensemble avec les formules exactes de
 * closedLoopAutopsyService (mêmes marginales q = K·p, même référence
 * uniforme, même mapping exponentiel de calibration) pour garantir que
 * les Δ contrefactuels sont comparables aux métriques publiées.
 */
const evaluateEnsemble = (
  ensemble: ArrayLike<number>,
  winners: Set<number>
): EnsembleOutcome => {
  let sumEnsemble = 0;
  for (let n = 1; n <= TOTAL_NUMBERS; n++) sumEnsemble += ensemble[n];

  const prob = new Float64Array(TOTAL_NUMBERS + 1);
  const uniformProb = 1.0 / TOTAL_NUMBERS;
  for (let n = 1; n <= TOTAL_NUMBERS; n++) {
    prob[n] = sumEnsemble > 0 ? ensemble[n] / sumEnsemble : uniformProb;
  }

  const ranked: Array<{ num: number; score: number }> = [];
  for (let n = 1; n <= TOTAL_NUMBERS; n++) {
    ranked.push({ num: n, score: ensemble[n] });
  }
  ranked.sort((a, b) => b.score - a.score || a.num - b.num);
  const top5 = ranked.slice(0, DRAW_SIZE).map((r) => r.num);

  let hitsTop5 = 0;
  for (const n of top5) {
    if (winners.has(n)) hitsTop5++;
  }

  const K = Math.max(1, winners.size || DRAW_SIZE);
  const pUniformMarginal = K / TOTAL_NUMBERS;
  const expectedUniformBrier = pUniformMarginal * (1.0 - pUniformMarginal);
  const pWinner = 1.0 / K;

  let brierSum = 0;
  let crossEntropy = 0;
  for (let n = 1; n <= TOTAL_NUMBERS; n++) {
    const isWinner = winners.has(n);
    const pSimplex = Math.max(1e-6, prob[n]);
    const qMarginal = Math.min(1.0, K * prob[n]);
    if (isWinner) {
      crossEntropy -= pWinner * Math.log(pSimplex);
    }
    brierSum += Math.pow(qMarginal - (isWinner ? 1.0 : 0.0), 2);
  }
  const brier = brierSum / TOTAL_NUMBERS;
  const calibration = Math.max(
    0,
    Math.min(100, 100 * Math.exp((-brier / Math.max(FLOAT_GUARD, expectedUniformBrier)) * Math.LN2))
  );

  return { top5, hitsTop5, brier, crossEntropy, calibration };
};

const meanOf = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

const populationStd = (values: number[], mean: number): number => {
  if (values.length === 0) return 0;
  let acc = 0;
  for (const v of values) acc += (v - mean) * (v - mean);
  return Math.sqrt(acc / values.length);
};

const buildNarrative = (
  label: string,
  shareTop5: number,
  shareWinners: number,
  dHits: number,
  dBrier: number,
  dHitsRealloc: number
): string => {
  const sharePct = (shareTop5 * 100).toFixed(1);
  const winnerPct = (shareWinners * 100).toFixed(1);
  if (dHits > 0) {
    return `${label} : contribution additive ${sharePct}% du Top-5 (${winnerPct}% du score gagnant). Sans ce canal, ${dHits} hit(s) causal(aux) perdu(s) sur le Top-5 (ΔBrier ${dBrier >= 0 ? '+' : ''}${dBrier.toFixed(4)}).`;
  }
  if (dHits < 0) {
    return `${label} : contribution additive ${sharePct}% du Top-5. Son ablation aurait GAGNÉ ${-dHits} hit(s) (ΔBrier ${dBrier >= 0 ? '+' : ''}${dBrier.toFixed(4)}) — signal redondant ou parasite sur ce tirage.`;
  }
  if (Math.abs(dHitsRealloc) > 0) {
    return `${label} : contribution additive ${sharePct}% du Top-5, impact causal nul en hits sur ce tirage (ΔBrier ${dBrier >= 0 ? '+' : ''}${dBrier.toFixed(4)}).`;
  }
  return `${label} : contribution additive ${sharePct}% du Top-5, neutre en contrefactuel sur ce tirage.`;
};

/**
 * Calcule l'attribution causale complète de chaque canal pour un tirage autopsié.
 * Pure et déterministe : mêmes entrées → mêmes sorties, bit pour bit.
 */
export const computeChannelAttribution = (
  input: ChannelAttributionInput
): ChannelCounterfactualImpact[] => {
  const { channelKeys, algoScores, weights, actualWinners, top5Predicted, labels } = input;
  const winners = new Set(actualWinners);
  const top5Set = new Set(top5Predicted);

  if (channelKeys.length === 0) return [];

  // Score d'ensemble complet en float64 : e_n = Σ_k w_k · s_kn.
  // La précision float64 évite tout résidu d'arrondi qui se comporterait
  // comme un signal fantôme après ablation d'un canal (intégrité causale).
  const channelWeight = (key: string): number =>
    Number.isFinite(weights[key]) ? Math.max(0, weights[key]) : 0;

  const accumulateEnsemble = (skipKey?: string): Float64Array => {
    const acc = new Float64Array(TOTAL_NUMBERS + 1);
    for (const key of channelKeys) {
      if (key === skipKey) continue;
      const w = channelWeight(key);
      const scores = algoScores[key];
      if (!scores || w === 0) continue;
      for (let n = 1; n <= TOTAL_NUMBERS; n++) {
        const s = scores[n];
        if (Number.isFinite(s)) acc[n] += w * s;
      }
    }
    return acc;
  };

  const ensemble = accumulateEnsemble();

  const fullOutcome = evaluateEnsemble(ensemble, winners);

  // Parts additives exactes sur le Top-5 prononcé et sur les gagnants réels
  const additiveShares = (subset: Set<number>): Record<string, number> => {
    let totalEnsemble = 0;
    for (const n of subset) totalEnsemble += ensemble[n];
    const shares: Record<string, number> = {};
    for (const key of channelKeys) {
      const w = Number.isFinite(weights[key]) ? Math.max(0, weights[key]) : 0;
      const scores = algoScores[key];
      let contribution = 0;
      if (scores && w > 0) {
        for (const n of subset) {
          const s = scores[n];
          if (Number.isFinite(s)) contribution += w * s;
        }
      }
      shares[key] = totalEnsemble > FLOAT_GUARD ? contribution / totalEnsemble : 0;
    }
    return shares;
  };

  const sharesTop5 = additiveShares(top5Set);
  const sharesWinners = additiveShares(winners);

  const impacts: ChannelCounterfactualImpact[] = channelKeys.map((key) => {
    const w = channelWeight(key);

    // Contrefactuel ablation par re-accumulation exacte Σ_{j≠k} w_j · s_jn :
    // ne soustrait pas la contribution k d'une somme arrondie (zéro résidu
    // numérique attribuable au canal retiré).
    const ablated = accumulateEnsemble(key);
    const ablationOutcome = evaluateEnsemble(ablated, winners);

    // Contrefactuel réallocation : masse w_k redistribuée par w_j / (1 - w_k).
    // Continu : le dénominateur est borné inférieurement, jamais de porte binaire.
    const reallocDenom = Math.max(1.0 - w, 1e-9);
    const reallocated = new Float64Array(TOTAL_NUMBERS + 1);
    for (let n = 1; n <= TOTAL_NUMBERS; n++) {
      reallocated[n] = ablated[n] / reallocDenom;
    }
    const reallocOutcome = evaluateEnsemble(reallocated, winners);

    return {
      key,
      label: labels?.[key] ?? key,
      weight: w,
      additiveShareTop5: sharesTop5[key] ?? 0,
      additiveShareWinners: sharesWinners[key] ?? 0,
      deltaHitsTop5Ablation: fullOutcome.hitsTop5 - ablationOutcome.hitsTop5,
      deltaBrierAblation: ablationOutcome.brier - fullOutcome.brier,
      deltaCrossEntropyAblation: ablationOutcome.crossEntropy - fullOutcome.crossEntropy,
      deltaCalibrationAblation: ablationOutcome.calibration - fullOutcome.calibration,
      deltaHitsTop5Reallocation: fullOutcome.hitsTop5 - reallocOutcome.hitsTop5,
      deltaBrierReallocation: reallocOutcome.brier - fullOutcome.brier,
      causalImportanceScore: 0, // calculé après collecte de tous les Δ (standardisation)
      causalRank: 0,
      narrative: '',
    };
  });

  // Standardisation continue : les poids du composite sont les écarts-types
  // OBSERVÉS entre canaux sur ce tirage — aucune constante d'échelle fixe.
  // Les Δ sont d'abord quantifiés à une précision relative à leur métrique
  // (1e-10 pour Brier/CE — précédent EG_TOL du stacking ; 1e-6 pour la
  // calibration en %), de sorte que la poussière de virgule flottante
  // (< 1e-14) ne soit jamais amplifiée en signal par la standardisation.
  // Si l'écart-type observé est nul (famille constante), z = 0 exactement :
  // c'est la limite correcte de (x - μ)/σ, aucun epsilon injecté.
  const QUANTUM_BRIER = 1e-10;
  const QUANTUM_CALIBRATION = 1e-6;
  const quantize = (v: number, quantum: number): number =>
    Math.round(v / quantum) * quantum;

  const dHits = impacts.map((i) => i.deltaHitsTop5Ablation);
  const dBrier = impacts.map((i) => quantize(i.deltaBrierAblation, QUANTUM_BRIER));
  const dCalib = impacts.map((i) => quantize(i.deltaCalibrationAblation, QUANTUM_CALIBRATION));
  const muH = meanOf(dHits);
  const muB = meanOf(dBrier);
  const muC = meanOf(dCalib);
  const sdH = populationStd(dHits, muH);
  const sdB = populationStd(dBrier, muB);
  const sdC = populationStd(dCalib, muC);
  const zScore = (v: number, mu: number, sd: number): number =>
    sd > 0 ? (v - mu) / sd : 0;

  const composites = impacts.map(
    (i, idx) =>
      zScore(dHits[idx], muH, sdH) +
      zScore(dBrier[idx], muB, sdB) +
      zScore(dCalib[idx], muC, sdC)
  );
  const maxComposite = Math.max(...composites);
  const exps = composites.map((z) => Math.exp(z - maxComposite));
  const sumExps = exps.reduce((a, b) => a + b, 0) || 1;

  impacts.forEach((impact, idx) => {
    impact.causalImportanceScore = exps[idx] / sumExps;
    impact.narrative = buildNarrative(
      impact.label,
      impact.additiveShareTop5,
      impact.additiveShareWinners,
      impact.deltaHitsTop5Ablation,
      impact.deltaBrierAblation,
      impact.deltaHitsTop5Reallocation
    );
  });

  impacts.sort((a, b) => {
    if (b.causalImportanceScore !== a.causalImportanceScore) {
      return b.causalImportanceScore - a.causalImportanceScore;
    }
    return a.key.localeCompare(b.key);
  });
  impacts.forEach((impact, idx) => {
    impact.causalRank = idx + 1;
  });

  return impacts;
};
