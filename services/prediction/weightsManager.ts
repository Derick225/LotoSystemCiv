import { AlgoWeights, DrawResult, ForensicReport } from '../../types';
import { AlgoKey, DEFAULT_ALGO_WEIGHTS, RETIRED_ALGO_WEIGHT_KEYS } from '../../shared/prediction.types';
import { packHistory } from '../workers/zeroCopy';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { get, set } from 'idb-keyval';
import { logger } from '../../utils/logger';
import { drawHasMachineNumbers } from '../../constants';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';

export const getDefaultWeights = (): AlgoWeights => ({ ...DEFAULT_ALGO_WEIGHTS });

/**
 * NORMALISATION L1 STRICTE AVEC BORNES TOPOLOGIQUES
 * Remplace les constantes arbitraires par des bornes dérivées de la taille de l'espace des algorithmes (N).
 */
export const normalizeWeights = (weights: AlgoWeights, options?: { bypassCap?: boolean }): AlgoWeights => {
  // CRITICAL FIX: Only use valid AlgoKeys to avoid old stale keys stealing probability mass
  const validKeys = Object.values(AlgoKey);
  const keys = Object.keys(weights).filter(k => validKeys.includes(k as AlgoKey)) as Array<AlgoKey>;
  
  if (keys.length === 0) {
    return { ...DEFAULT_ALGO_WEIGHTS };
  }

  const numAlgos = keys.length;
  
  // Plancher : 1 / (2 * N) garantit qu'aucun algo actif n'est totalement éteint mais pénalise la dilution excessive
  const FLOOR = 1.0 / (2.0 * numAlgos);
  // Plafond : 1 - (1 / sqrt(N)), garantissant qu'aucun algo ne dépasse la domination statistique naturelle
  const CEILING = options?.bypassCap ? (1.0 - (1.0 / Math.sqrt(numAlgos))) : Math.min(0.50, 2.0 / Math.sqrt(numAlgos));
  
  let w: Record<string, number> = {};
  let initialSum = 0;

  keys.forEach(key => {
    let val = weights[key];
    if (typeof val !== 'number' || isNaN(val) || val < 0) val = 0;
    // Déduplication ALGO-6 / refonte ALGO-7 : les canaux retirés (redondants ou
    // pseudo-scientifiques) sont forcés à zéro ici, au point de passage unique de toute
    // pondération, afin qu'aucun poids persisté ou recalibré ne puisse les réactiver.
    if (RETIRED_ALGO_WEIGHT_KEYS.has(key)) val = 0;
    w[key] = val;
    initialSum += val;
  });

  if (initialSum > 0) {
    keys.forEach(key => { w[key] = w[key] / initialSum; });
  } else {
    // Repli uniforme : les canaux retirés (ALGO-6 / ALGO-7) restent exclus même si toutes
    // les pondérations d'entrée sont nulles, pour éviter toute réactivation accidentelle.
    const activeKeys = keys.filter(key => !RETIRED_ALGO_WEIGHT_KEYS.has(key));
    const uniform = 1.0 / Math.max(1, activeKeys.length);
    keys.forEach(key => { w[key] = RETIRED_ALGO_WEIGHT_KEYS.has(key) ? 0 : uniform; });
  }

  const maxProjectIterations = Math.max(10, numAlgos * 2);
  for (let iter = 0; iter < maxProjectIterations; iter++) {
    let currentSum = 0;
    keys.forEach(k => {
      // Respect des poids nuls : si le poids est explicitement 0 (ou quasi nul < 0.0001), on ne lui impose pas de FLOOR
      if (weights[k] === 0 || w[k] <= 0.0001) {
        w[k] = 0;
      } else {
        w[k] = Math.max(FLOOR, Math.min(CEILING, w[k]));
      }
      currentSum += w[k];
    });

    if (Math.abs(currentSum - 1.0) < Number.EPSILON * 100 || currentSum === 0) break;

    const error = 1.0 - currentSum;
    const freeKeys = keys.filter(k => w[k] > 0 && w[k] > FLOOR && w[k] < CEILING);
    const targetKeys = freeKeys.length > 0 ? freeKeys : keys.filter(k => w[k] > 0);
    const adjustment = targetKeys.length > 0 ? (error / targetKeys.length) : 0;

    targetKeys.forEach(k => { w[k] = Math.max(0, w[k] + adjustment); });
  }

  let finalTotal = 0;
  keys.forEach(k => {
    if (w[k] > 0) {
      w[k] = Math.max(FLOOR, Math.min(CEILING, w[k]));
      w[k] = parseFloat(w[k].toFixed(6));
    } else {
      w[k] = 0;
    }
    finalTotal += w[k];
  });

  if (finalTotal > 0 && Math.abs(finalTotal - 1.0) > 1e-5) {
    const sortedKeys = [...keys].filter(k => w[k] > 0).sort((a, b) => {
      const diff = w[b] - w[a];
      return diff !== 0 ? diff : a.localeCompare(b);
    });
    if (sortedKeys.length > 0) {
      w[sortedKeys[0]] = parseFloat((w[sortedKeys[0]] + (1.0 - finalTotal)).toFixed(6));
    }
  }

  return w as AlgoWeights;
};

export const adjustWeightsForRegime = (
  weights: AlgoWeights, 
  regimeInfo?: { regime: string, hurst: number, entropy: number, volatility: number },
  empiricalProofMap?: Record<string, number>
): AlgoWeights => {
  if (!regimeInfo) return normalizeWeights(weights);
  const { hurst, entropy, volatility } = regimeInfo;
  const adjusted = { ...weights };

  // Entropie normalisée dans [0, 1]
  const maxEntropy = Math.log2(90); 
  const normalizedEntropy = entropy > 1.0 ? Math.min(1.0, entropy / maxEntropy) : Math.max(0.0, Math.min(1.0, entropy));

  // Paramétrage statistique de la pente sigmoïde basé sur l'énergie du système (Volatilité / Entropie)
  const systemEnergy = Math.max(1.0, volatility / 10.0);
  const transitionSteepness = Math.max(Math.E, maxEntropy * systemEnergy);

  // Amortissement Dynamique de Hurst (H) : Sigmoïde continue
  const w_hurst = 0.5 * (1.0 + Math.tanh(transitionSteepness * (hurst - 0.5)));
  const persistenceFactor = w_hurst;
  const meanReversionFactor = 1.0 - persistenceFactor;
  const volFactor = Math.max(0, Math.min(1, volatility / 100.0));

  // ============================================================================
  // PONDÉRATION PAR RÉGIME CONDITIONNÉE PAR LA PREUVE EMPIRIQUE (ZÉRO BOOST ARBITRAIRE)
  // Règle d'architecture : Aucun algorithme ne reçoit de boost de régime s'il n'a pas
  // fait ses preuves (preuve empirique > 0 sur l'historique du tirage actif).
  // ============================================================================

  const deterministicFactor = 1.0 / (1.0 + Math.exp(transitionSteepness * (normalizedEntropy - 0.5)));
  const chaoticFactor = 1.0 / (1.0 + Math.exp(-transitionSteepness * (normalizedEntropy - 0.5)));

  // Fonction de modulation continue de la preuve empirique
  const getProofGain = (key: AlgoKey): number => {
    if (!empiricalProofMap) return 0.0; // Mode neutre sans avantage
    const proof = empiricalProofMap[key] || 0;
    // Si l'algorithme n'a pas fait ses preuves (proof <= 0), le gain est strictement 0 (aucun boost)
    return Math.max(0, Math.tanh(proof));
  };

  // 1. Amplification Déterministe / Périodique (Cadences de gisements) - uniquement si prouvé
  adjusted[AlgoKey.GAP_CADENCE] = (adjusted[AlgoKey.GAP_CADENCE] || 0) * (1.0 + deterministicFactor * getProofGain(AlgoKey.GAP_CADENCE));
  adjusted[AlgoKey.GAP_PATTERN] = (adjusted[AlgoKey.GAP_PATTERN] || 0) * (1.0 + deterministicFactor * getProofGain(AlgoKey.GAP_PATTERN));
  adjusted[AlgoKey.GAP_SEQUENCE] = (adjusted[AlgoKey.GAP_SEQUENCE] || 0) * (1.0 + deterministicFactor * getProofGain(AlgoKey.GAP_SEQUENCE));
  adjusted[AlgoKey.GAP_BAND_SEQUENCE] = (adjusted[AlgoKey.GAP_BAND_SEQUENCE] || 0) * (1.0 + deterministicFactor * getProofGain(AlgoKey.GAP_BAND_SEQUENCE));

  // 2. Amplification Chaotique / Haut-Bruit (Topologie & Bayésien) - uniquement si prouvé
  adjusted[AlgoKey.BAYES] = (adjusted[AlgoKey.BAYES] || 0) * (1.0 + chaoticFactor * getProofGain(AlgoKey.BAYES));
  adjusted[AlgoKey.TEMPORAL] = (adjusted[AlgoKey.TEMPORAL] || 0) * (1.0 + chaoticFactor * getProofGain(AlgoKey.TEMPORAL));
  adjusted[AlgoKey.SPECTRAL] = (adjusted[AlgoKey.SPECTRAL] || 0) * (1.0 + chaoticFactor * volFactor * getProofGain(AlgoKey.SPECTRAL));
  adjusted[AlgoKey.FRACTAL] = (adjusted[AlgoKey.FRACTAL] || 0) * (1.0 + chaoticFactor * getProofGain(AlgoKey.FRACTAL));
  adjusted[AlgoKey.ECHO_STATE] = (adjusted[AlgoKey.ECHO_STATE] || 0) * (1.0 + chaoticFactor * volFactor * getProofGain(AlgoKey.ECHO_STATE));
  adjusted[AlgoKey.DERIVED_NEIGHBOR] = (adjusted[AlgoKey.DERIVED_NEIGHBOR] || 0) * (1.0 + chaoticFactor * getProofGain(AlgoKey.DERIVED_NEIGHBOR));

  // Multiplicateurs de persistance Hurst & Tendance - uniquement si prouvé
  adjusted[AlgoKey.FREQUENCY] = (adjusted[AlgoKey.FREQUENCY] || 0) * (1.0 + persistenceFactor * getProofGain(AlgoKey.FREQUENCY));
  adjusted[AlgoKey.MARKOV] = (adjusted[AlgoKey.MARKOV] || 0) * (1.0 + persistenceFactor * 0.5 * getProofGain(AlgoKey.MARKOV));
  adjusted[AlgoKey.GAPS] = (adjusted[AlgoKey.GAPS] || 0) * (1.0 + meanReversionFactor * getProofGain(AlgoKey.GAPS));

  const persistencePremium = Math.max(0, hurst - 0.5) * getProofGain(AlgoKey.GAP_TREND);
  adjusted[AlgoKey.GAP_TREND] = (adjusted[AlgoKey.GAP_TREND] || 0) * (1.0 + persistencePremium);

  return normalizeWeights(adjusted);
};

export interface AlgoProofMetric {
  hasProof: boolean;
  proofScore: number;
  empiricalHitRate: number;
  baselineRate: number;
  confidence: number;
  // p-value unilatérale brute (queue supérieure) du z-score du canal sous H0.
  pValue?: number;
  // p-value ajustée Benjamini-Hochberg (FDR) sur la famille des canaux testés.
  qValue?: number;
}

const algoEmpiricalProofCache = new Map<string, Record<AlgoKey, AlgoProofMetric>>();

/**
 * Effectif minimal attendu pour la validité de l'approximation normale d'une binomiale
 * (règle de Cochran, 1954 : np ≥ 5). Constante statistique PUBLIÉE — même statut que le facteur
 * de consistance MAD 1.4826 ou l'approximation logistique 1.702 déjà utilisés dans le moteur —
 * et non un seuil de décision arbitraire réglable. Sert uniquement à atténuer continûment les
 * canaux dont l'échantillon est trop mince pour que le z-score soit fiable.
 */
const COCHRAN_MIN_EXPECTED_COUNT = 5.0;

/**
 * Fonction de survie normale standard P(Z > z) = ½·(1 − erf(z/√2)).
 * erf approché par Abramowitz & Stegun 7.1.26 (précision ~1.5e-7). Les coefficients sont des
 * constantes mathématiques publiées (même statut que le facteur de consistance MAD 1.4826),
 * aucun réglage arbitraire. 100 % déterministe.
 */
const normalUpperTail = (z: number): number => {
  const x = z / Math.SQRT2;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1.0 / (1.0 + 0.3275911 * ax);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = sign * (1.0 - poly * Math.exp(-ax * ax));
  return Math.max(0, Math.min(1, 0.5 * (1.0 - erf)));
};

/**
 * ÉVALUATION EMPIRIQUE DE LA VALEUR PRÉDICTIVE D'UN ALGORITHME
 * 
 * Règle d'or : "Qu'aucun algorithme ne soit prioritaire s'il n'a pas fait ses preuves."
 * Évalue rétrospectivement sur l'historique isolé du tirage si les signaux RÉELS de chaque
 * algorithme ont effectivement permis d'extraire les numéros gagnants par rapport au hasard.
 */
export const evaluateAlgoEmpiricalProof = (
  drawName: string,
  history: DrawResult[]
): Record<AlgoKey, AlgoProofMetric> => {
  const validKeys = Object.values(AlgoKey);
  const result: Record<AlgoKey, AlgoProofMetric> = {} as any;
  const baselineRate = 5.0 / 90.0; // Espérance stochastique neutre

  if (!history || history.length < 5) {
    validKeys.forEach(k => {
      result[k] = {
        hasProof: false,
        proofScore: 0,
        empiricalHitRate: baselineRate,
        baselineRate,
        confidence: 0
      };
    });
    return result;
  }

  const cacheKey = `${(drawName || 'default').trim().toLowerCase()}_${history.length}_${history[0]?.date || 'nodate'}_${history[0]?.gagnants?.join('-') || 'none'}`;
  const cached = algoEmpiricalProofCache.get(cacheKey);
  if (cached) return cached;

  const isolatedHistory = history.filter(d => !d.drawName || d.drawName.trim().toLowerCase() === drawName.trim().toLowerCase());
  const sample = isolatedHistory.length >= 5 ? isolatedHistory : history;
  const T = sample.length;
  // Profondeur d'évaluation empirique alignée sur l'espérance mathématique (90/5 = 18)
  const expectedMeanGap = 90.0 / 5.0; 
  const evalDepth = Math.min(Math.ceil(expectedMeanGap * 1.5), T - 1);
  // Fonction de confiance temporelle basée sur le cycle théorique
  const confidence = Math.tanh(T / expectedMeanGap);

  // Module d'atténuation exponentielle continue basée sur l'âge des tirages
  const temporalDecayHalfLife = Math.max(4, evalDepth * 0.45);
  const temporalDecayRate = Math.LN2 / temporalDecayHalfLife;

  let sumWeights = 0;
  let sumWeightsSq = 0;

  // Comptabilisation des succès empiriques pondérés dans le temps par canal algorithmique
  const hits: Record<AlgoKey, number> = {} as any;
  const trials: Record<AlgoKey, number> = {} as any;
  validKeys.forEach(k => { hits[k] = 0; trials[k] = 0; });

  const numIndices = Array.from({ length: 90 }, (_, i) => i + 1);

  for (let t = 0; t < evalDepth; t++) {
    const actualDraw = sample[t].gagnants;
    const subHistory = sample.slice(t + 1);
    if (subHistory.length < 3) continue;

    // Poids d'atténuation temporelle exponentielle continue w_t = exp(-lambda * t)
    const tWeight = Math.exp(-temporalDecayRate * t);
    sumWeights += tWeight;
    sumWeightsSq += tWeight * tWeight;

    const lastWinners = subHistory[0]?.gagnants || [];
    const subT = subHistory.length;

    // 1. Canal Fréquentiel
    const subFreq = new Int32Array(91);
    subHistory.forEach(d => d.gagnants.forEach(n => { if (n >= 1 && n <= 90) subFreq[n]++; }));
    const topFreq = [...numIndices].sort((a, b) => subFreq[b] - subFreq[a]).slice(0, 10);
    hits[AlgoKey.FREQUENCY] += topFreq.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.FREQUENCY] += 10 * tWeight;

    // 2. Canal Gaps & Écarts
    const subGaps = new Int32Array(91);
    for (let n = 1; n <= 90; n++) {
      let g = 0;
      for (let s = 0; s < subT; s++) {
        if (subHistory[s].gagnants.includes(n)) break;
        g++;
      }
      subGaps[n] = g;
    }
    const topGaps = [...numIndices].sort((a, b) => subGaps[b] - subGaps[a]).slice(0, 10);
    hits[AlgoKey.GAPS] += topGaps.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.GAPS] += 10 * tWeight;

    // 3. Canal Markov Transitions
    const markovTrans = new Int32Array(91);
    for (let s = 0; s < Math.min(subT - 1, 30); s++) {
      const curr = subHistory[s].gagnants;
      const prev = subHistory[s + 1].gagnants;
      const match = prev.some(p => lastWinners.includes(p));
      if (match) {
        curr.forEach(n => { if (n >= 1 && n <= 90) markovTrans[n]++; });
      }
    }
    const topMarkov = [...numIndices].sort((a, b) => markovTrans[b] - markovTrans[a]).slice(0, 10);
    hits[AlgoKey.MARKOV] += topMarkov.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.MARKOV] += 10 * tWeight;

    // 4. Canal Momentum (Différentiel court terme vs long terme)
    const shortL = Math.min(5, Math.floor(subT / 2));
    const longL = Math.min(20, subT);
    const momScores = new Float32Array(91);
    if (shortL > 0 && longL > shortL) {
      for (let n = 1; n <= 90; n++) {
        const sC = subHistory.slice(0, shortL).filter(d => d.gagnants.includes(n)).length / shortL;
        const lC = subHistory.slice(0, longL).filter(d => d.gagnants.includes(n)).length / longL;
        momScores[n] = sC - lC;
      }
    }
    const topMom = [...numIndices].sort((a, b) => momScores[b] - momScores[a]).slice(0, 10);
    hits[AlgoKey.MOMENTUM] += topMom.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.MOMENTUM] += 10 * tWeight;

    // 5. Canal GAP_CADENCE (Stabilité de cadence et résonance de phase)
    const cadenceScores = new Float32Array(91);
    for (let n = 1; n <= 90; n++) {
      const gapsList: number[] = [];
      let lastIdx = -1;
      for (let s = 0; s < Math.min(subT, 40); s++) {
        if (subHistory[s].gagnants.includes(n)) {
          if (lastIdx !== -1) gapsList.push(s - lastIdx);
          lastIdx = s;
        }
      }
      if (gapsList.length > 0) {
        const meanCadence = gapsList.reduce((a, b) => a + b, 0) / gapsList.length;
        const currentGap = subGaps[n];
        const variance = gapsList.reduce((a, b) => a + Math.pow(b - meanCadence, 2), 0) / gapsList.length;
        cadenceScores[n] = Math.exp(-Math.pow(currentGap - meanCadence, 2) / (2 * Math.max(1, variance)));
      }
    }
    const topCadence = [...numIndices].sort((a, b) => cadenceScores[b] - cadenceScores[a]).slice(0, 10);
    hits[AlgoKey.GAP_CADENCE] += topCadence.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.GAP_CADENCE] += 10 * tWeight;

    // 6. Canal GAP_PATTERN (signature de gap successif) — canal retiré (ALGO-6), proxy
    // conservé uniquement pour l'affichage d'audit. L'ancien bonus « g % 5 === 0 » (nombre
    // magique + porte binaire, et pure numérologie : rien ne rend les écarts multiples de 5
    // spéciaux) a été supprimé au profit du seul ratio fréquence/écart, continu et justifié.
    const gapPatternScores = new Float32Array(91);
    for (let n = 1; n <= 90; n++) {
      const g = subGaps[n];
      gapPatternScores[n] = subFreq[n] / (g + 1);
    }
    const topGapPattern = [...numIndices].sort((a, b) => gapPatternScores[b] - gapPatternScores[a]).slice(0, 10);
    hits[AlgoKey.GAP_PATTERN] += topGapPattern.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.GAP_PATTERN] += 10 * tWeight;

    // 7. Canal GAP_SEQUENCE (Évolution différentielle des 2 derniers écarts)
    const gapSeqScores = new Float32Array(91);
    for (let n = 1; n <= 90; n++) {
      const g = subGaps[n];
      gapSeqScores[n] = g > 0 ? (g * 0.6 + subFreq[n] * 0.4) : 0;
    }
    const topGapSeq = [...numIndices].sort((a, b) => gapSeqScores[b] - gapSeqScores[a]).slice(0, 10);
    hits[AlgoKey.GAP_SEQUENCE] += topGapSeq.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.GAP_SEQUENCE] += 10 * tWeight;

    // 8. Canal GAP_BAND_SEQUENCE (Dynamique des déciles 1-9, 10-19, ...)
    const bandFreq = new Int32Array(10);
    lastWinners.forEach(n => { bandFreq[Math.floor((n - 1) / 10)]++; });
    const bandScores = new Float32Array(91);
    for (let n = 1; n <= 90; n++) {
      const b = Math.floor((n - 1) / 10);
      bandScores[n] = (bandFreq[b] > 0 ? 0.5 : 1.5) * subFreq[n];
    }
    const topBandSeq = [...numIndices].sort((a, b) => bandScores[b] - bandScores[a]).slice(0, 10);
    hits[AlgoKey.GAP_BAND_SEQUENCE] += topBandSeq.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.GAP_BAND_SEQUENCE] += 10 * tWeight;

    // 9. Canal GAP_TREND (Pente d'accélération de sortie)
    const gapTrendScores = new Float32Array(91);
    for (let n = 1; n <= 90; n++) {
      gapTrendScores[n] = momScores[n] * (1.0 + subGaps[n] * 0.05);
    }
    const topGapTrend = [...numIndices].sort((a, b) => gapTrendScores[b] - gapTrendScores[a]).slice(0, 10);
    hits[AlgoKey.GAP_TREND] += topGapTrend.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.GAP_TREND] += 10 * tWeight;

    // 10. Canal SPECTRAL (Projection de puissance fréquentielle Fourier)
    const spectralScores = new Float32Array(91);
    const harmonicOmega = (2 * Math.PI) / Math.max(4, Math.floor(subT / 3));
    for (let n = 1; n <= 90; n++) {
      let re = 0, im = 0;
      for (let s = 0; s < Math.min(subT, 30); s++) {
        if (subHistory[s].gagnants.includes(n)) {
          re += Math.cos(harmonicOmega * s);
          im += Math.sin(harmonicOmega * s);
        }
      }
      spectralScores[n] = Math.sqrt(re * re + im * im);
    }
    const topSpectral = [...numIndices].sort((a, b) => spectralScores[b] - spectralScores[a]).slice(0, 10);
    hits[AlgoKey.SPECTRAL] += topSpectral.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.SPECTRAL] += 10 * tWeight;

    // 11. Canal BAYES (Mise à jour bayésienne prior global x vraisemblance locale)
    const bayesScores = new Float32Array(91);
    const windowW = Math.min(10, subT);
    for (let n = 1; n <= 90; n++) {
      const prior = (subFreq[n] + 1) / (subT * 5 + 90);
      const localCount = subHistory.slice(0, windowW).filter(d => d.gagnants.includes(n)).length;
      const likelihood = (localCount + 1) / (windowW * 5 + 90);
      bayesScores[n] = prior * likelihood;
    }
    const topBayes = [...numIndices].sort((a, b) => bayesScores[b] - bayesScores[a]).slice(0, 10);
    hits[AlgoKey.BAYES] += topBayes.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.BAYES] += 10 * tWeight;

    // 12. Canal TEMPORAL (Déclin exponentiel temporel continu)
    const temporalScores = new Float32Array(91);
    const lambda = 1.0 / Math.max(3, Math.sqrt(subT));
    for (let s = 0; s < Math.min(subT, 25); s++) {
      const decay = Math.exp(-lambda * s);
      subHistory[s].gagnants.forEach(n => { if (n >= 1 && n <= 90) temporalScores[n] += decay; });
    }
    const topTemporal = [...numIndices].sort((a, b) => temporalScores[b] - temporalScores[a]).slice(0, 10);
    hits[AlgoKey.TEMPORAL] += topTemporal.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.TEMPORAL] += 10 * tWeight;

    // 13. Canal FRACTAL (Persistance d'échelle et exposant de Hurst local)
    const fractalScores = new Float32Array(91);
    for (let n = 1; n <= 90; n++) {
      fractalScores[n] = (subFreq[n] / (subGaps[n] + 1)) * (1.0 + Math.abs(momScores[n]));
    }
    const topFractal = [...numIndices].sort((a, b) => fractalScores[b] - fractalScores[a]).slice(0, 10);
    hits[AlgoKey.FRACTAL] += topFractal.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.FRACTAL] += 10 * tWeight;

    // 14. Canal ECHO_STATE (Réservoir stochastique à états retardés)
    const echoScores = new Float32Array(91);
    for (let s = 0; s < Math.min(subT, 5); s++) {
      const echoWeight = Math.sin((s + 1) * 1.57);
      subHistory[s].gagnants.forEach(n => { if (n >= 1 && n <= 90) echoScores[n] += echoWeight; });
    }
    const topEcho = [...numIndices].sort((a, b) => echoScores[b] - echoScores[a]).slice(0, 10);
    hits[AlgoKey.ECHO_STATE] += topEcho.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.ECHO_STATE] += 10 * tWeight;

    // 15. Canal AFFINITY (Co-occurrences avec les numéros du dernier tirage)
    const affinityScores = new Float32Array(91);
    for (let s = 0; s < Math.min(subT, 30); s++) {
      const d = subHistory[s].gagnants;
      const overlap = d.filter(x => lastWinners.includes(x)).length;
      if (overlap > 0) {
        d.forEach(n => { if (n >= 1 && n <= 90) affinityScores[n] += overlap; });
      }
    }
    const topAffinity = [...numIndices].sort((a, b) => affinityScores[b] - affinityScores[a]).slice(0, 10);
    hits[AlgoKey.AFFINITY] += topAffinity.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.AFFINITY] += 10 * tWeight;

    // 16. Canal SPATIAL (Proximité spatiale grille 9x10 avec derniers gagnants)
    const spatialScores = new Float32Array(91);
    lastWinners.forEach(w => {
      const r_w = Math.floor((w - 1) / 10);
      const c_w = (w - 1) % 10;
      for (let n = 1; n <= 90; n++) {
        const r_n = Math.floor((n - 1) / 10);
        const c_n = (n - 1) % 10;
        const distSq = (r_w - r_n) ** 2 + (c_w - c_n) ** 2;
        spatialScores[n] += Math.exp(-distSq / 4.0);
      }
    });
    const topSpatial = [...numIndices].sort((a, b) => spatialScores[b] - spatialScores[a]).slice(0, 10);
    hits[AlgoKey.SPATIAL] += topSpatial.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.SPATIAL] += 10 * tWeight;

    // 17. Canal DERIVED_NEIGHBOR (Voisins numériques +/- 1 et +/- 10 modulo 90)
    const neighborScores = new Float32Array(91);
    lastWinners.forEach(w => {
      [w - 1, w + 1, w - 10, w + 10].forEach(cand => {
        let n = cand;
        if (n < 1) n += 90;
        if (n > 90) n -= 90;
        neighborScores[n] += 1;
      });
    });
    const topNeighbor = [...numIndices].sort((a, b) => neighborScores[b] - neighborScores[a]).slice(0, 10);
    hits[AlgoKey.DERIVED_NEIGHBOR] += topNeighbor.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.DERIVED_NEIGHBOR] += 10 * tWeight;

    // 18. Canal SHADOW_PROBABILITY (Numéros froids à basse variance d'écart)
    const shadowScores = new Float32Array(91);
    for (let n = 1; n <= 90; n++) {
      shadowScores[n] = subGaps[n] / (subFreq[n] + 1);
    }
    const topShadow = [...numIndices].sort((a, b) => shadowScores[b] - shadowScores[a]).slice(0, 10);
    hits[AlgoKey.SHADOW_PROBABILITY] += topShadow.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.SHADOW_PROBABILITY] += 10 * tWeight;

    // 19. Canal NETWORK_CORRELATION (Centralité de réseau dans les graphes de co-occurrences)
    const networkScores = new Float32Array(91);
    for (let s = 0; s < Math.min(subT, 20); s++) {
      const g = subHistory[s].gagnants;
      for (let i = 0; i < g.length; i++) {
        for (let j = i + 1; j < g.length; j++) {
          networkScores[g[i]] += 1;
          networkScores[g[j]] += 1;
        }
      }
    }
    const topNetwork = [...numIndices].sort((a, b) => networkScores[b] - networkScores[a]).slice(0, 10);
    hits[AlgoKey.NETWORK_CORRELATION] += topNetwork.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.NETWORK_CORRELATION] += 10 * tWeight;

    // 20. Canal SEQUENCE_PATTERN (Motifs de paires/triplettes consécutives)
    const seqPatternScores = new Float32Array(91);
    for (let s = 0; s < Math.min(subT - 1, 15); s++) {
      const d1 = subHistory[s].gagnants;
      const d2 = subHistory[s + 1].gagnants;
      d1.forEach(n1 => {
        d2.forEach(n2 => {
          if (Math.abs(n1 - n2) === 1) seqPatternScores[n1] += 2;
        });
      });
    }
    const topSeqPattern = [...numIndices].sort((a, b) => seqPatternScores[b] - seqPatternScores[a]).slice(0, 10);
    hits[AlgoKey.SEQUENCE_PATTERN] += topSeqPattern.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.SEQUENCE_PATTERN] += 10 * tWeight;

    // 21. Canal INTER_MONTHLY_RESONANCE (Périodicité mensuelle multi-échelles & harmoniques temporelles continues)
    const targetDateObj = sample[t].date ? new Date(sample[t].date) : null;
    const currentDay = targetDateObj ? targetDateObj.getDay() : 0;
    const currentDom = targetDateObj ? targetDateObj.getDate() : 15;
    const interMonthlyScores = new Float32Array(91);
    for (let s = 0; s < subT; s++) {
      const sDateObj = subHistory[s].date ? new Date(subHistory[s].date) : null;
      if (sDateObj) {
        const sDay = sDateObj.getDay();
        const sDom = sDateObj.getDate();
        // Distance angulaire intra-mensuelle continue sur 30.44 jours
        const aDomTarget = (2.0 * Math.PI * (currentDom - 1)) / 30.43685;
        const aDomSource = (2.0 * Math.PI * (sDom - 1)) / 30.43685;
        const diffDom = Math.abs(aDomTarget - aDomSource) % (2.0 * Math.PI);
        const distDom = Math.min(diffDom, 2.0 * Math.PI - diffDom);
        const domHarmonic = Math.exp(-0.5 * Math.pow(distDom / ((2.0 * Math.PI * 3.5) / 30.43685), 2));

        // Harmonique jour de la semaine continue
        const dowDiff = Math.abs(currentDay - sDay);
        const dowHarmonic = Math.pow(Math.cos((Math.PI * dowDiff) / 7.0), 2);

        // Amortissement temporel continu sans coupure brusque
        const timeDecay = Math.exp(-s / 25.0);
        const weight = (0.6 * domHarmonic + 0.4 * dowHarmonic) * timeDecay;

        if (weight > 0.05) {
          subHistory[s].gagnants.forEach(n => { if (n >= 1 && n <= 90) interMonthlyScores[n] += weight; });
        }
      }
    }
    const topMonthly = [...numIndices].sort((a, b) => interMonthlyScores[b] - interMonthlyScores[a]).slice(0, 10);
    hits[AlgoKey.INTER_MONTHLY_RESONANCE] += topMonthly.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.INTER_MONTHLY_RESONANCE] += 10 * tWeight;

    // 22. Canal ISOLATION_ANOMALY (Anomalie d'écart dans l'espace d'états)
    const isolationScores = new Float32Array(91);
    for (let n = 1; n <= 90; n++) {
      isolationScores[n] = Math.abs(subGaps[n] - 18) * subFreq[n];
    }
    const topIsolation = [...numIndices].sort((a, b) => isolationScores[b] - isolationScores[a]).slice(0, 10);
    hits[AlgoKey.ISOLATION_ANOMALY] += topIsolation.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.ISOLATION_ANOMALY] += 10 * tWeight;

    // 23. Canal MACHINE_TRANSFER (Co-occurrence empirique et transfert machine -> gagnants)
    const machineScores = new Float32Array(91);
    const prevMachine = subHistory[0]?.machine || [];
    if (Array.isArray(prevMachine) && prevMachine.length > 0) {
      for (let s = 0; s < Math.min(subT - 1, 20); s++) {
        const mPrev = subHistory[s + 1]?.machine || [];
        const wCurr = subHistory[s]?.gagnants || [];
        if (mPrev.length > 0 && wCurr.length > 0) {
          const decay = Math.exp(-s / 10.0);
          mPrev.forEach(m => {
            if (wCurr.includes(m)) machineScores[m] += decay * 1.5;
            if (m > 1 && wCurr.includes(m - 1)) machineScores[m - 1] += decay * 0.5;
            if (m < 90 && wCurr.includes(m + 1)) machineScores[m + 1] += decay * 0.5;
          });
        }
      }
      prevMachine.forEach(m => {
        if (m >= 1 && m <= 90) machineScores[m] += 1.0;
      });
      const topMachine = [...numIndices].sort((a, b) => machineScores[b] - machineScores[a]).slice(0, 10);
      hits[AlgoKey.MACHINE_TRANSFER] += topMachine.filter(n => actualDraw.includes(n)).length * tWeight;
      trials[AlgoKey.MACHINE_TRANSFER] += 10 * tWeight;
    } else {
      // Aucun essai si le tirage ne contient aucune donnée machine
      trials[AlgoKey.MACHINE_TRANSFER] += 10 * tWeight;
    }

    // 24. Canal INTER_DRAW_RESONANCE (Report direct, miroirs décimaux et compléments 91)
    const interDrawScores = new Float32Array(91);
    if (lastWinners.length > 0) {
      lastWinners.forEach(n => {
        if (n >= 1 && n <= 90) {
          interDrawScores[n] += 1.8; // Carry-over direct continu
          // Miroir décimal
          const d1 = Math.floor(n / 10);
          const d2 = n % 10;
          const mir = d2 * 10 + d1;
          if (mir >= 1 && mir <= 90 && mir !== n) interDrawScores[mir] += 1.1;
          // Complément 91
          const comp = 91 - n;
          if (comp >= 1 && comp <= 90 && comp !== n) interDrawScores[comp] += 1.0;
        }
      });
    }
    const topInterDraw = [...numIndices].sort((a, b) => interDrawScores[b] - interDrawScores[a]).slice(0, 10);
    hits[AlgoKey.INTER_DRAW_RESONANCE] += topInterDraw.filter(n => actualDraw.includes(n)).length * tWeight;
    trials[AlgoKey.INTER_DRAW_RESONANCE] += 10 * tWeight;
  }

  // Taille d'échantillon effective de Kish pour séries pondérées exponentiellement
  const nEff = sumWeightsSq > 0 ? (sumWeights * sumWeights) / sumWeightsSq : 1;

  // Vérification stricte de la présence de numéros machine sur le tirage
  const hasMachine = drawHasMachineNumbers(drawName, sample);

  // --- PASSE 1 : statistiques brutes par canal (z-score, p-value bilatérale, profondeur) ---
  // Sous H0 (aucun pouvoir prédictif réel), les 24 canaux produisent des z-scores ~N(0,1) : la moitié
  // dépassent 0 par pur bruit. L'ancien test `proofScore > 0` les "boostait" donc à tort (fléau des
  // comparaisons multiples). On calcule d'abord les statistiques individuelles, puis on corrige.
  interface ChannelStat { z: number; rate: number; pTwo: number; depth: number; tested: boolean; }
  const stats: Record<string, ChannelStat> = {};
  validKeys.forEach(k => {
    // Sécurité si aucune donnée machine sur ce tirage : essais forcés pour certifier zScore négatif / nul
    if (k === AlgoKey.MACHINE_TRANSFER && !hasMachine) {
      hits[k] = 0;
      trials[k] = Math.max(10, sample.length * 10);
    }
    const t = trials[k] || 0;
    const tested = t > 0;
    const h = hits[k] || 0;
    const rate = tested ? h / t : 0;
    const effectiveTrials = Math.max(1, (t / (sumWeights || 1)) * nEff);
    const stdErr = Math.sqrt((baselineRate * (1.0 - baselineRate)) / effectiveTrials) || Number.EPSILON;
    const z = (rate - baselineRate) / stdErr;
    // p-value bilatérale exacte (loi normale) : probabilité d'un |z| au moins aussi extrême sous H0.
    const pTwo = Math.min(1, 2 * normalUpperTail(Math.abs(z)));
    // Adéquation de profondeur (règle de Cochran, effectif attendu ≥ 5 succès sous H0) : facteur
    // continu saturant, nul sur échantillon trop mince pour que l'approximation normale soit valide.
    const expectedSuccesses = effectiveTrials * baselineRate;
    const depth = 1.0 - Math.exp(-expectedSuccesses / COCHRAN_MIN_EXPECTED_COUNT);
    stats[k] = { z, rate, pTwo, depth, tested };
  });

  // --- PASSE 2 : correction Benjamini-Hochberg (FDR) sur la famille des canaux testés ---
  const testedKeys = validKeys.filter(k => stats[k].tested);
  const m = testedKeys.length;
  const qValues: Record<string, number> = {};
  if (m > 0) {
    const ascending = [...testedKeys].sort((a, b) => stats[a].pTwo - stats[b].pTwo);
    let runningMin = 1.0;
    // q-value step-up : q_(i) = min(q_(i+1), (m/i)·p_(i)), borné à [0,1] et monotone.
    for (let i = m - 1; i >= 0; i--) {
      const rank = i + 1;
      const adj = Math.min(1.0, (m / rank) * stats[ascending[i]].pTwo);
      runningMin = Math.min(runningMin, adj);
      qValues[ascending[i]] = runningMin;
    }
  } else {
    validKeys.forEach(k => { qValues[k] = 1.0; });
  }

  // Tolérance FDR dérivée de la structure du jeu (aucun seuil de décision arbitraire type 0.05) :
  // la proportion neutre de numéros gagnants (5/90) sert d'échelle de risque intrinsèque.
  const fdrTolerance = baselineRate;

  // --- PASSE 3 : assemblage honnête. Sous H0, q→1 donc proofScore→0 : poids uniformes par défaut. ---
  validKeys.forEach(k => {
    const s = stats[k];
    const q = qValues[k] ?? 1.0;
    // Atténuation continue par (1 − q) : conserve le SIGNE (boost si meilleur, dampening si pire)
    // mais réduit l'amplitude vers 0 quand la preuve n'est pas distinguable du bruit.
    const proofScore = s.z * confidence * s.depth * (1.0 - q);
    // Preuve (boost) = rejet de H0 par BH (q ≤ tolérance), dans le sens supérieur, garde machine.
    const hasProof = s.tested && q <= fdrTolerance && s.z > 0.0 && (k !== AlgoKey.MACHINE_TRANSFER || hasMachine);

    result[k] = {
      hasProof,
      proofScore: parseFloat(proofScore.toFixed(4)),
      empiricalHitRate: parseFloat(s.rate.toFixed(4)),
      baselineRate: parseFloat(baselineRate.toFixed(4)),
      confidence: parseFloat(confidence.toFixed(4)),
      pValue: parseFloat(s.pTwo.toFixed(6)),
      qValue: parseFloat(q.toFixed(6))
    };
  });

  if (algoEmpiricalProofCache.size > 100) {
    const firstKey = algoEmpiricalProofCache.keys().next().value;
    if (firstKey) algoEmpiricalProofCache.delete(firstKey);
  }
  algoEmpiricalProofCache.set(cacheKey, result);

  return result;
};

export const ALGO_DISPLAY_NAMES: Record<AlgoKey, string> = {
  [AlgoKey.FREQUENCY]: "Fréquence Linéaire",
  [AlgoKey.GAPS]: "Écarts & Retards",
  [AlgoKey.SPECTRAL]: "Transformée de Fourier (DFT)",
  [AlgoKey.MARKOV]: "Transitions Markoviennes",
  [AlgoKey.BAYES]: "Vraisemblance Bayésienne",
  [AlgoKey.MOMENTUM]: "Momentum Différentiel",
  [AlgoKey.AFFINITY]: "Affinités de Co-occurrence",
  [AlgoKey.SPATIAL]: "Topologie Spatiale Grille",
  [AlgoKey.TEMPORAL]: "Processus Hawkes Temporel",
  [AlgoKey.FRACTAL]: "Multi-Fractal & Hurst",
  [AlgoKey.SHADOW_PROBABILITY]: "Probabilités Fantômes",
  [AlgoKey.NETWORK_CORRELATION]: "Centralité de Réseau",
  [AlgoKey.ECHO_STATE]: "Réservoir Echo State",
  [AlgoKey.GAP_SEQUENCE]: "Séquences d'Écarts",
  [AlgoKey.DERIVED_NEIGHBOR]: "Voisins & Miroirs Dérivés",
  [AlgoKey.GAP_PATTERN]: "Motifs Géométriques d'Écarts",
  [AlgoKey.SEQUENCE_PATTERN]: "Motifs de Séquences",
  [AlgoKey.GAP_CADENCE]: "Harmoniques de Cadence",
  [AlgoKey.GAP_TREND]: "Accélération de Tendance",
  [AlgoKey.INTER_MONTHLY_RESONANCE]: "Résonance Inter-Mensuelle",
  [AlgoKey.ISOLATION_ANOMALY]: "Anomalie d'Isolation",
  [AlgoKey.GAP_BAND_SEQUENCE]: "Dynamique par Déciles",
  [AlgoKey.MACHINE_TRANSFER]: "Transfert Machine",
  [AlgoKey.INTER_DRAW_RESONANCE]: "Résonance Inter-Tirages",
};

export interface AlgoWeightProofItem {
  key: AlgoKey;
  name: string;
  weight: number;
  baselineWeight: number; // 1 / N (ex: 0.04167)
  empiricalHitRate: number;
  baselineRate: number; // 5 / 90 (0.0556)
  proofScore: number; // Z-Score
  hasProof: boolean;
  status: "PROUVE" | "DECOTE_CONFORME" | "NEUTRE" | "SURPONDERE_NON_CONFIRME";
  isCompliant: boolean;
  relativeGain: number; // empiricalHitRate / baselineRate
  justification: string;
}

export interface AlgoWeightsProofReport {
  drawName: string;
  complianceRate: number; // 0 à 100%
  isStrictlyValid: boolean;
  provenCount: number;
  unprovenDampedCount: number;
  unconfirmedBoostsCount: number;
  averageHitRate: number;
  averageAlphaGain: number;
  overallZScore: number;
  items: AlgoWeightProofItem[];
}

/**
 * VALIDATION STRICTE DU POIDS DES ALGORITHMES PAR PREUVE DE CONFIRMATION DE RÉUSSITE
 *
 * Règle d'or absolue : "Qu'aucun algorithme ne soit surpondéré ou prioritaire sans preuve empirique de réussite."
 * Compare chaque poids actif w_k au poids d'équiprobabilité neutre w_0 = 1 / 24 (~4.17%).
 * Si un algorithme n'a pas prouvé sa capacité prédictive (Z <= 0 ou hitRate <= 5/90) sur l'historique isolé du tirage,
 * son poids DOIT être inférieur ou égal au seuil neutre (amorti).
 * S'il dépasse ce seuil sans preuve empirique, il est déclaré NON CONFORME.
 */
export const validateAlgoWeightsByProof = (
  drawName: string,
  history: DrawResult[],
  weights?: AlgoWeights
): AlgoWeightsProofReport => {
  const validKeys = Object.values(AlgoKey);
  const numAlgos = validKeys.length;
  const baselineWeight = 1.0 / numAlgos; // 1 / 24 = ~0.04167
  const baselineRate = 5.0 / 90.0; // Espérance neutre 5.56%

  const cleanHistory = purifyHistoryForDraw(drawName, history);
  const effectiveWeights = normalizeWeights(weights || getDefaultWeights());
  const proofMap = evaluateAlgoEmpiricalProof(drawName, cleanHistory);
  const hasMachine = drawHasMachineNumbers(drawName, cleanHistory);

  let compliantCount = 0;
  let provenCount = 0;
  let unprovenDampedCount = 0;
  let unconfirmedBoostsCount = 0;
  let sumHitRate = 0;
  let sumZScore = 0;

  const items: AlgoWeightProofItem[] = validKeys.map(key => {
    const w = effectiveWeights[key] !== undefined ? effectiveWeights[key] : baselineWeight;
    const proof = proofMap[key] || {
      hasProof: false,
      proofScore: 0,
      empiricalHitRate: baselineRate,
      baselineRate,
      confidence: 0
    };

    const relativeGain = proof.baselineRate > 0 ? proof.empiricalHitRate / proof.baselineRate : 1.0;
    sumHitRate += proof.empiricalHitRate;
    sumZScore += proof.proofScore;

    // Règle spécifique Transfert Machine
    if (key === AlgoKey.MACHINE_TRANSFER && !hasMachine) {
      const isZero = w <= 0.0001;
      if (isZero) {
        compliantCount++;
        unprovenDampedCount++;
        return {
          key,
          name: ALGO_DISPLAY_NAMES[key] || key,
          weight: w,
          baselineWeight,
          empiricalHitRate: proof.empiricalHitRate,
          baselineRate: proof.baselineRate,
          proofScore: proof.proofScore,
          hasProof: false,
          status: "DECOTE_CONFORME",
          isCompliant: true,
          relativeGain,
          justification: "Tirage sans numéros machine certifié : poids nul (0.00%) strictement respecté."
        };
      } else {
        unconfirmedBoostsCount++;
        return {
          key,
          name: ALGO_DISPLAY_NAMES[key] || key,
          weight: w,
          baselineWeight,
          empiricalHitRate: proof.empiricalHitRate,
          baselineRate: proof.baselineRate,
          proofScore: proof.proofScore,
          hasProof: false,
          status: "SURPONDERE_NON_CONFIRME",
          isCompliant: false,
          relativeGain,
          justification: `Incohérence : Tirage sans machine mais poids résiduel non nul (${(w * 100).toFixed(2)}%).`
        };
      }
    }

    // Algorithme ayant prouvé sa réussite prédictive
    if (proof.hasProof && proof.proofScore > 0) {
      provenCount++;
      compliantCount++;
      return {
        key,
        name: ALGO_DISPLAY_NAMES[key] || key,
        weight: w,
        baselineWeight,
        empiricalHitRate: proof.empiricalHitRate,
        baselineRate: proof.baselineRate,
        proofScore: proof.proofScore,
        hasProof: true,
        status: "PROUVE",
        isCompliant: true,
        relativeGain,
        justification: `Confirmation empirique avérée (Z = +${proof.proofScore.toFixed(2)}, hit-rate ${(proof.empiricalHitRate * 100).toFixed(1)}% vs ${(proof.baselineRate * 100).toFixed(1)}%). Surpondération légitime.`
      };
    }

    // Algorithme non prouvé ou à performance stochastique neutre / sous le hasard
    // Tolérance d'arrondi de normalisation : 0.005
    const isWithinBaselineTolerance = w <= baselineWeight + 0.005;
    if (isWithinBaselineTolerance) {
      compliantCount++;
      unprovenDampedCount++;
      const isDamped = w < baselineWeight - 0.002;
      return {
        key,
        name: ALGO_DISPLAY_NAMES[key] || key,
        weight: w,
        baselineWeight,
        empiricalHitRate: proof.empiricalHitRate,
        baselineRate: proof.baselineRate,
        proofScore: proof.proofScore,
        hasProof: false,
        status: isDamped ? "DECOTE_CONFORME" : "NEUTRE",
        isCompliant: true,
        relativeGain,
        justification: isDamped
          ? `Amorti conformément aux preuves (Z = ${proof.proofScore.toFixed(2)} <= 0, poids réduit à ${(w * 100).toFixed(2)}%).`
          : `Poids neutre à l'espérance mathématique (4.17%), sans surpondération injustifiée.`
      };
    } else {
      unconfirmedBoostsCount++;
      return {
        key,
        name: ALGO_DISPLAY_NAMES[key] || key,
        weight: w,
        baselineWeight,
        empiricalHitRate: proof.empiricalHitRate,
        baselineRate: proof.baselineRate,
        proofScore: proof.proofScore,
        hasProof: false,
        status: "SURPONDERE_NON_CONFIRME",
        isCompliant: false,
        relativeGain,
        justification: `Violation : Poids (${(w * 100).toFixed(2)}%) supérieur au seuil neutre (4.17%) sans confirmation empirique de succès (Z = ${proof.proofScore.toFixed(2)} <= 0).`
      };
    }
  });

  const complianceRate = Math.round((compliantCount / numAlgos) * 100);
  const averageHitRate = sumHitRate / numAlgos;
  const averageAlphaGain = baselineRate > 0 ? averageHitRate / baselineRate : 1.0;
  const overallZScore = parseFloat((sumZScore / numAlgos).toFixed(3));

  return {
    drawName,
    complianceRate,
    isStrictlyValid: complianceRate === 100,
    provenCount,
    unprovenDampedCount,
    unconfirmedBoostsCount,
    averageHitRate: parseFloat(averageHitRate.toFixed(4)),
    averageAlphaGain: parseFloat(averageAlphaGain.toFixed(3)),
    overallZScore,
    items
  };
};

/**
 * APPLICATION STRICTE DE LA PREUVE DE RÉUSSITE SUR LES POIDS (AUTO-RÉPARATION DÉTERMINISTE)
 *
 * Élimine toute surpondération non prouvée et recalibre l'ensemble du vecteur de poids
 * de façon continue selon les scores de preuve empiriques du tirage.
 */
export const enforceStrictWeightsProof = (
  drawName: string,
  history: DrawResult[],
  weights?: AlgoWeights
): AlgoWeights => {
  const validKeys = Object.values(AlgoKey);
  const baselineWeight = 1.0 / validKeys.length;
  const cleanHistory = purifyHistoryForDraw(drawName, history);
  const baseW = weights ? { ...weights } : getDefaultWeights();
  const proofMap = evaluateAlgoEmpiricalProof(drawName, cleanHistory);
  const hasMachine = drawHasMachineNumbers(drawName, cleanHistory);

  const adjusted: Record<string, number> = {};

  validKeys.forEach(k => {
    if (k === AlgoKey.MACHINE_TRANSFER && !hasMachine) {
      adjusted[k] = 0.0;
      return;
    }

    const currentVal = typeof baseW[k] === 'number' && !isNaN(baseW[k]) ? baseW[k] : baselineWeight;
    const proof = proofMap[k];

    if (proof && proof.hasProof && proof.proofScore > 0) {
      // Prouvé : amplifié de façon continue et différentiable selon le Z-score
      const boost = 1.0 + Math.tanh(proof.proofScore);
      adjusted[k] = Math.max(baselineWeight, currentVal * boost);
    } else {
      // Non prouvé : strictement contraint sous le seuil neutre par sigmoïde continue
      const z = proof ? proof.proofScore : -1.0;
      const dampener = 1.0 / (1.0 + Math.exp(-2.5 * z)); // <= 0.5 quand z <= 0
      adjusted[k] = Math.min(baselineWeight, currentVal) * dampener;
    }
  });

  return normalizeWeights(adjusted as AlgoWeights);
};

/**
 * RENFORCEMENT CHRONOLOGIQUE PAR ANALYSE HISTORIQUE DU TIRAGE SÉLECTIONNÉ
 * 
 * Règle d'architecture :
 * - Tous les algorithmes partent de la même force/valeur par défaut (1.0 / equipondérés).
 * - "Qu'aucun algorithme ne soit prioritaire s'il n'a pas fait ses preuves."
 * - Seuls les algorithmes ayant une preuve empirique positive (score de preuve > 0)
 *   sur l'historique délimité du tirage actif peuvent obtenir un multiplicateur > 1.0.
 * - Tout algorithme non prouvé ou à la performance sous le hasard voit son poids amorti en continu (multiplicateur << 1.0).
 */
export const computeChronologicalAlgoReinforcement = (
  drawName: string,
  history: DrawResult[],
  baseWeights: AlgoWeights
): AlgoWeights => {
  const validKeys = Object.values(AlgoKey);
  if (!history || history.length < 5) {
    return normalizeWeights(baseWeights);
  }

  // 1. Évaluation rigoureuse des preuves empiriques propres au tirage actif
  const proofResults = evaluateAlgoEmpiricalProof(drawName, history);
  const isolatedHistory = history.filter(d => !d.drawName || d.drawName.trim().toLowerCase() === drawName.trim().toLowerCase());
  const sample = isolatedHistory.length >= 5 ? isolatedHistory : history;
  const T = sample.length;
  const sampleConfidence = Math.tanh(T / 30.0);

  // 2. Application de la règle : AUCUNE priorité sans preuve & Zéro Transfert Machine si tirage sans machine
  const hasMachine = drawHasMachineNumbers(drawName, sample);
  const reinforced: Record<string, number> = {};
  validKeys.forEach(k => {
    if (k === AlgoKey.MACHINE_TRANSFER && !hasMachine) {
      reinforced[k] = 0.0; // Poids nul si aucune donnée machine enregistrée sur ce tirage
      return;
    }

    const baseW = baseWeights[k] !== undefined ? Number(baseWeights[k]) : 1.0;
    const proof = proofResults[k];

    if (!proof || !proof.hasProof || proof.proofScore <= 0) {
      // AUCUNE PREUVE : L'algorithme ne peut JAMAIS être prioritaire
      // Amortissement différentiable continu selon l'écart au hasard : Sigmoïde logistique raide
      const z = proof ? proof.proofScore : -1.0;
      const unprovenMultiplier = 1.0 / (1.0 + Math.exp(-2.5 * z)); // Multiplicateur <= 0.5 quand z <= 0, tombant vers 0.05 quand z < -1
      reinforced[k] = Math.max(0.001, baseW * unprovenMultiplier);
    } else {
      // PREUVE EMPIRIQUE VALORISÉE : L'algorithme a démontré sa supériorité sur le tirage actif
      const earnedBoost = Math.tanh(proof.proofScore) * sampleConfidence;
      const provenMultiplier = 1.0 + earnedBoost;
      reinforced[k] = Math.max(0.001, baseW * provenMultiplier);
    }
  });

  return normalizeWeights(reinforced as AlgoWeights);
};

export const applyMetaLearning = async (weights: AlgoWeights, history: DrawResult[], drawName?: string): Promise<AlgoWeights> => {
  const dynamicWeights = { ...weights };
  try {
    const { getLocalForensicReports } = await import('../postPredictionAnalysisService');
    let forensicReports = await getLocalForensicReports() || [];
    if (drawName) forensicReports = forensicReports.filter(r => r.drawName === drawName);
    
    // CORRECTION : Fenêtre dynamique absolue basée sur l'entropie de l'historique
    const entropyWindow = forensicReports.length > 0 ? 
      Math.abs(forensicReports.reduce((acc, r) => acc + (r.shannon_entropy || 0), 0) / forensicReports.length) : 1;
    const windowSize = Math.max(5, Math.floor(Math.sqrt(forensicReports.length) * (1.0 + (entropyWindow / Math.log2(90)))));
    const recentReports = forensicReports.slice(0, windowSize);
    
    if (recentReports.length > 0) {
      // CORRECTION : Demi-vie dynamique basée sur la taille de la fenêtre
      const dynamicHalfLife = Math.max(1, Math.floor(windowSize / 2));
      const algosList = Object.keys(dynamicWeights) as AlgoKey[];
      const numAlgos = algosList.length || 1;

      // FILTRE DE KALMAN MULTI-DIMENSIONNEL DÉTERMINISTE
      // État de l'estimateur de vélocité de performance/multiplicateur des poids:
      // x: multiplicateur de poids estimé (initialisé à 1.0, neutre)
      // P: covariance d'erreur / incertitude théorique (initialisé à 1.0)
      const kalmanStates: Record<AlgoKey, { x: number; P: number }> = {} as any;
      algosList.forEach(algo => {
        kalmanStates[algo] = { x: 1.0, P: 1.0 };
      });

      // Chargement passif de l'historique de feedback humain pour RLHF (Phase 3)
      const predictionsMap = new Map<string, any>();
      try {
        // Tenter de charger depuis l'index centralisé rapide pour éviter d'analyser toutes les clés IndexedDB
        const feedbackIndexStr = await get('feedback_index_map');
        if (feedbackIndexStr) {
          const indexObj = typeof feedbackIndexStr === 'string' ? JSON.parse(feedbackIndexStr) : feedbackIndexStr;
          Object.keys(indexObj).forEach(id => {
            predictionsMap.set(id, indexObj[id]);
          });
        } else {
          // Fallback sur le scan complet et création de l'index pour optimiser les appels futurs
          const { keys: idbKeys } = await import('idb-keyval');
          const allKeys = await idbKeys();
          const histKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('pred_'));
          const newIndexObj: Record<string, any> = {};
          for (const k of histKeys) {
            const itemStr = await get(k as string);
            if (itemStr) {
              try {
                const item = typeof itemStr === 'string' ? JSON.parse(itemStr) : itemStr;
                if (item && item.id) {
                  predictionsMap.set(item.id, item);
                  if (item.feedback) {
                    newIndexObj[item.id] = { id: item.id, feedback: item.feedback };
                  }
                }
              } catch (parseErr) {
                console.warn("[WeightsManager] Erreur parsing item prediction:", parseErr);
              }
            }
          }
          if (Object.keys(newIndexObj).length > 0) {
            await set('feedback_index_map', JSON.stringify(newIndexObj));
          }
        }
      } catch (indexErr) {
        console.warn("[WeightsManager] Erreur reconstruction index feedback:", indexErr);
      }

      // Simulation chronologique stricte (du plus ancien au plus récent)
      const chronologicalReports = [...recentReports].reverse();

      chronologicalReports.forEach((report, index) => {
        if (report.isBlackSwan) return;

        // Horloge inversée pour calculer le déclin temporel
        const originalIndexInRecent = (recentReports.length - 1) - index;
        const timeDecay = Math.pow(0.5, originalIndexInRecent / dynamicHalfLife); 
        
        // Incertitude intrinsèque de la mesure basée sur le Brier Score [0, 1]
        const brierNormalized = Math.max(0, Math.min(1.0, report.brier_score || 0.5));
        
        // Pénalité d'incertitude liée à l'unité d'intégrité (UFI)
        const ufiPenalty = report.unifiedIntegrityIndex !== undefined ? Math.max(0, (100 - report.unifiedIntegrityIndex) / 100) : 0;
        
        // Bruit de mesure de base R (Zéro Nombre Magique, déduit des algos et pénalités)
        const baseR = Math.max(1.0 / (2.0 * numAlgos), brierNormalized + ufiPenalty * (1.0 / Math.sqrt(numAlgos)));
        
        // Bruit de mesure modulé par le temps d'observation: l'incertitude augmente pour les données historiques (timeDecay faible)
        const finalR = baseR / (timeDecay + Number.EPSILON);

        // Bruit de procédé/dynamique Q (stabilité temporelle et protection anti-amnésie)
        const Q = (1.0 / (numAlgos * numAlgos)) / Math.sqrt(recentReports.length + 1);

        algosList.forEach(algo => {
          const state = kalmanStates[algo];

          // 1. Prediction Step / Phase de Prédiction
          const P_pred = state.P + Q;

          // 2. Observation / Mesure (z_t) recommandée par les analyses d'erreurs
          let z_t = 1.0;

          // A. Ajustements proposés par l'autopsie d'écart
          if (report.proposedAdjustments && report.proposedAdjustments.length > 0) {
            const adj = report.proposedAdjustments.find(a => a.algo === algo);
            if (adj) {
              // Activation continue pour éviter une brisure de gradient
              const shockFactor = 1.0 + ((1.0 / numAlgos) * (1.0 - Math.exp(-Math.abs(adj.proposedWeightChange))));
              z_t += adj.proposedWeightChange * shockFactor;
            }
          }

          // B. Estimations contrefactuelles (Synergies et ADN optimal)
          if (report.counterfactuals && report.counterfactuals.length > 0) {
            report.counterfactuals.forEach(cf => {
              if (cf.action === 'OPTIMAL_DNA' && cf.optimalWeightsDistribution) {
                const optW = cf.optimalWeightsDistribution[algo];
                if (typeof optW === 'number' && weights[algo] > 0) {
                  const multiplier = optW / weights[algo];
                  // Intégration de la divergence d'ADN optimal dans la mesure
                  z_t += (multiplier - 1.0) * (1.0 / 2.0);
                }
              } else if (cf.action === 'SYNERGY' && cf.algo) {
                const parts = cf.algo.split('+').map(a => a.trim() as AlgoKey);
                if (parts.includes(algo)) {
                  z_t += (cf.rankImprovement || 0) / Math.max(1.0, recentReports.length);
                }
              } else if (cf.algo === algo) {
                const modifier = (cf.action === 'BOOST' || cf.action === 'ISOLATE') ? 1.0 : -1.0;
                z_t += modifier * ((cf.rankImprovement || 0) / Math.max(1.0, recentReports.length));
              }
            });
          }

          // C. Compensation de la dérive KL Divergence (Théorie de l'Information)
          if (report.kl_divergence && report.kl_divergence > 0) {
            const maxKL = Math.log(90.0);
            const klImpact = 1.0 - Math.exp(-(report.kl_divergence / maxKL)); // Asymptotique vers 1.0
            const normalizedImpact = klImpact / numAlgos;
            if (algo === AlgoKey.FREQUENCY) z_t -= normalizedImpact;
            if (algo === AlgoKey.GAPS) z_t += normalizedImpact;
            if (algo === AlgoKey.AFFINITY) z_t += normalizedImpact;
          }

          // D. Compensation de l'effondrement de l'Entropie de Shannon
          if (report.shannon_entropy && report.shannon_entropy > 0 && algo === AlgoKey.MARKOV) {
            const maxEntropy = Math.log2(90.0);
            const entropyImpact = 1.0 - Math.exp(-(report.shannon_entropy / maxEntropy)); // Asymptotique vers 1.0
            z_t += entropyImpact / numAlgos;
          }

          // E. Alignement RLHF (Reinforcement Learning from Human Feedback) - Phase 3
          if (report.predictionId) {
            const pred = predictionsMap.get(report.predictionId);
            if (pred && pred.feedback && pred.feedback.userRating) {
              const rating = pred.feedback.userRating;
              const adj = report.proposedAdjustments?.find(a => a.algo === algo);
              const changeMagnitude = adj ? Math.abs(adj.proposedWeightChange) : (1.0 / numAlgos);
              
              if (rating === "Visionnaire") {
                // Renforcement positif proportionnel à l'ajustement proposé
                const isContrib = adj && adj.proposedWeightChange > 0;
                z_t += changeMagnitude * (isContrib ? 1.0 : (1.0 / 2.0)); 
              } else if (rating === "Incohérente") {
                // Pénalisation continue (feedback négatif) 
                const isOffender = adj && adj.proposedWeightChange < 0;
                z_t -= changeMagnitude * (isOffender ? 1.0 : (1.0 / 2.0));
              }
            }
          }

          // Écrêtage physique continu pour éviter les poles singuliers / exponentielles folles
          // Utilisation de la tangente hyperbolique pour mapper vers (0, scale) continuellement
          const scale = Math.log(90.0);
          z_t = scale * Math.tanh(Math.max(Number.EPSILON, z_t) / scale);

          // 3. Phase de mise à jour (Correction de Kalman)
          const rawK = P_pred / (P_pred + finalR); // Gain de Kalman brut
          
          // GESTION DU CATASTROPHIC FORGETTING (Régularisation de Huber / Norme L1)
          const innovation = z_t - state.x;
          // Utilisation de la distribution de Cauchy pour étaler la sensibilité aux valeurs aberrantes
          // Le facteur de dispersion (gamma) est lié à l'incertitude P_pred
          const gamma = Math.max(Number.EPSILON, P_pred);
          const resilienceFactor = 1.0 / (1.0 + Math.pow((innovation / gamma), 2));
          const K = rawK * resilienceFactor; // Gain de Kalman throttlé

          state.x = state.x + K * innovation; // Mise à jour de l'estimation de l'état
          state.P = (1.0 - K) * P_pred; // Mise à jour de la covariance d'erreur
        });
      });

      // Injection des ratios Kalman stabilisés dans les poids physiques du moteur
      const proofMap = evaluateAlgoEmpiricalProof(drawName || 'default', history);
      algosList.forEach(algo => {
        const proof = proofMap[algo];
        const hasProof = proof && proof.hasProof && proof.proofScore > 0;
        let factor = kalmanStates[algo].x;
        
        // RÈGLE ABSOLUE : Qu'aucun algorithme ne voie son poids augmenté s'il ne fait pas ses preuves
        if (!hasProof && factor > 1.0) {
          factor = 1.0;
        }
        if (!hasProof && proof && proof.proofScore < 0) {
          factor *= Math.max(0.2, 1.0 / (1.0 + Math.exp(-2.0 * proof.proofScore)));
        }
        
        dynamicWeights[algo] *= factor;
      });

      return normalizeWeights(dynamicWeights);
    }
  } catch (e) {
    logger.warn({ err: e }, "Erreur Meta-Learning, fallback vers les poids normalisés.");
  }

  if (history.length < 20) return normalizeWeights(dynamicWeights);

  return new Promise((resolve) => {
    try {
      const worker = new Worker(new URL('../workers/metaLearning.worker.ts?worker', import.meta.url), { type: 'module' });
      const timeoutMs = 15000;
      const timer = setTimeout(() => {
        logger.warn(`Meta-Learning Worker Timeout (${timeoutMs}ms), falling back`);
        worker.terminate();
        resolve(normalizeWeights(dynamicWeights));
      }, timeoutMs);

      worker.onmessage = (event) => {
        clearTimeout(timer);
        const { type, bestConfig, error } = event.data;
        if (type === 'SUCCESS' && bestConfig) resolve(bestConfig);
        else {
          logger.warn({ err: error }, "Worker error during meta-learning fallback");
          resolve(normalizeWeights(dynamicWeights));
        }
        worker.terminate();
      };
      worker.onerror = (e) => {
        clearTimeout(timer);
        logger.warn({ err: e.message }, "Worker execution error");
        resolve(normalizeWeights(dynamicWeights));
        worker.terminate();
      };

      const historyLite = history.map(h => ({
        gagnants: h.gagnants,
        machine: h.machine || [],
        date: h.date || ""
      }));

      const packed = packHistory(historyLite);
      const transferList: Transferable[] = [];
      if (packed.historyBuffer && (typeof SharedArrayBuffer === 'undefined' || !(packed.historyBuffer instanceof SharedArrayBuffer))) {
        transferList.push(packed.historyBuffer);
      }
      worker.postMessage({ 
        dynamicWeights, 
        historyBuffer: packed.historyBuffer,
        drawCount: packed.drawCount,
        winningCount: packed.winningCount,
        totalCols: packed.totalCols 
      }, transferList);
    } catch (err) {
      logger.warn({ err }, "Failed to spawn meta-learning worker");
      resolve(normalizeWeights(dynamicWeights));
    }
  });
};

const weightsCache = new Map<string, { weights: AlgoWeights; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 30; // Cache weights for 30 seconds to deduplicate database queries

/**
 * Retourne la liste des clés d'algorithmes applicables pour un tirage.
 * Les noms de tirage qui n'ont pas de numéro machines ne doivent pas avoir l'algorithme "Transfert Machine".
 */
export const getApplicableAlgoKeys = (
  drawName?: string,
  history?: DrawResult[]
): AlgoKey[] => {
  const hasMachine = drawHasMachineNumbers(drawName, history);
  return Object.values(AlgoKey).filter(k => k !== AlgoKey.MACHINE_TRANSFER || hasMachine);
};

export const getAlgoWeights = async (drawName: string): Promise<AlgoWeights> => {
  const now = Date.now();
  const cached = weightsCache.get(drawName);
  const hasMachine = drawHasMachineNumbers(drawName);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    if (!hasMachine && cached.weights[AlgoKey.MACHINE_TRANSFER] !== 0) {
      cached.weights = normalizeWeights({ ...cached.weights, [AlgoKey.MACHINE_TRANSFER]: 0 });
    }
    return cached.weights;
  }

  let weights: AlgoWeights = getDefaultWeights();
  let localWeights: Partial<AlgoWeights> | null = null;
  let localUpdatedAt: Date | null = null;

  // 1. Lire les poids locaux depuis IndexedDB (Source de Vérité Locale)
  if (typeof indexedDB !== 'undefined') {
    try {
      const parsed = await get<{ weights: Partial<AlgoWeights>; updatedAt?: string }>(`nexus_config_${drawName}`);
      if (parsed?.weights && Object.keys(parsed.weights).length > 0) {
        localWeights = parsed.weights as Partial<AlgoWeights>;
        if (parsed.updatedAt) {
          localUpdatedAt = new Date(parsed.updatedAt);
        }
      }
    } catch (e) { /* Silenced */ }
  }

  // Si on a des poids locaux, on les renvoie instantanément (SWR) et on revalide en arrière-plan
  if (localWeights) {
    const localMergedWeights = normalizeWeights({ ...weights, ...localWeights });
    weightsCache.set(drawName, { weights: localMergedWeights, timestamp: now });

    // Revalidation asynchrone en arrière-plan pour ne pas bloquer le thread principal ni les transitions d'UI
    if (typeof window !== 'undefined' && isSupabaseConfigured() && navigator.onLine) {
      (async () => {
        try {
          let remoteWeights: Partial<AlgoWeights> | null = null;
          let remoteUpdatedAt: Date | null = null;

          const fetchPromise = supabase
            .from('model_weights_config')
            .select('weights, updated_at')
            .eq('draw_name', drawName)
            .maybeSingle();

          const timeoutPromise = new Promise<{ data: any }>((resolve) => setTimeout(() => resolve({ data: null }), 2000));
          const { data: adaptiveConfig } = await Promise.race([fetchPromise, timeoutPromise]);

          if (adaptiveConfig?.weights) {
            remoteWeights = adaptiveConfig.weights as Partial<AlgoWeights>;
            if (adaptiveConfig.updated_at) {
              remoteUpdatedAt = new Date(adaptiveConfig.updated_at);
            }
          } else {
            const fetchLegacy = supabase
              .from('algo_weights')
              .select('weights, updated_at')
              .eq('draw_name', drawName)
              .maybeSingle();
            const { data } = await Promise.race([fetchLegacy, timeoutPromise]);

            if (data?.weights) {
              remoteWeights = data.weights as Partial<AlgoWeights>;
              if (data.updated_at) {
                remoteUpdatedAt = new Date(data.updated_at);
              }
            }
          }

          if (remoteWeights && remoteUpdatedAt && localUpdatedAt) {
            // Si les poids distants sont strictement plus récents (+ de 5 min d'avance), on met à jour le local
            if (remoteUpdatedAt.getTime() > localUpdatedAt.getTime() + 300000) {
              const freshWeights = normalizeWeights({ ...getDefaultWeights(), ...remoteWeights });
              // Mettre à jour IndexedDB
              await set(`nexus_config_${drawName}`, {
                weights: remoteWeights,
                updatedAt: remoteUpdatedAt.toISOString()
              });
              // Mettre à jour le cache mémoire
              weightsCache.set(drawName, { weights: freshWeights, timestamp: Date.now() });
              
              // Mettre à jour le store si l'utilisateur est toujours sur ce tirage
              if (typeof window !== 'undefined') {
                const { useNexusStore } = await import('../../store/useNexusStore');
                const activeDraw = useNexusStore.getState().drawName;
                if (activeDraw === drawName) {
                  useNexusStore.getState().setGlobalWeights(freshWeights);
                }
              }
            }
          }
        } catch (e) {
          // Silenced background error
        }
      })();
    }

    return localMergedWeights;
  }

  // Si aucun poids local n'est présent (premier démarrage ou cache vidé), on fait le fetch synchrone complet avec timeout strict
  let remoteWeights: Partial<AlgoWeights> | null = null;
  let remoteUpdatedAt: Date | null = null;

  if (isSupabaseConfigured() && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const fetchAdaptive = supabase
        .from('model_weights_config')
        .select('weights, updated_at')
        .eq('draw_name', drawName)
        .maybeSingle();
      const timeoutPromise = new Promise<{ data: any }>((resolve) => setTimeout(() => resolve({ data: null }), 2000));
      const { data: adaptiveConfig } = await Promise.race([fetchAdaptive, timeoutPromise]);

      if (adaptiveConfig?.weights) {
        remoteWeights = adaptiveConfig.weights as Partial<AlgoWeights>;
        if (adaptiveConfig.updated_at) {
          remoteUpdatedAt = new Date(adaptiveConfig.updated_at);
        }
      } else {
        const fetchLegacy = supabase
          .from('algo_weights')
          .select('weights, updated_at')
          .eq('draw_name', drawName)
          .maybeSingle();
        const { data } = await Promise.race([fetchLegacy, timeoutPromise]);

        if (data?.weights) {
          remoteWeights = data.weights as Partial<AlgoWeights>;
          if (data.updated_at) {
            remoteUpdatedAt = new Date(data.updated_at);
          }
        }
      }
    } catch (e) { /* Silenced */ }
  }

  if (remoteWeights) {
    weights = { ...weights, ...remoteWeights };
    // Sauvegarder localement pour les futurs chargements instantanés
    try {
      await set(`nexus_config_${drawName}`, {
        weights: remoteWeights,
        updatedAt: remoteUpdatedAt ? remoteUpdatedAt.toISOString() : new Date().toISOString()
      });
    } catch (e) { /* Silenced */ }
  }

  if (!hasMachine) {
    weights[AlgoKey.MACHINE_TRANSFER] = 0;
  }

  const finalWeights = normalizeWeights(weights);
  weightsCache.set(drawName, { weights: finalWeights, timestamp: now });
  return finalWeights;
};

export const saveAlgoWeights = async (drawName: string, weights: AlgoWeights) => {
  const hasMachine = drawHasMachineNumbers(drawName);
  const weightsToSave = { ...weights };
  if (!hasMachine) {
    weightsToSave[AlgoKey.MACHINE_TRANSFER] = 0;
  }
  const normalized = normalizeWeights(weightsToSave);
  // Update memory cache immediately
  weightsCache.set(drawName, { weights: normalized, timestamp: Date.now() });

  try {
    if (typeof window !== 'undefined') {
      const payload = { weights: normalized, updatedAt: new Date().toISOString() };
      await set(`nexus_config_${drawName}`, payload);

      // Diffuse l'événement pour notifier tous les composants et onglets en temps réel
      window.dispatchEvent(
        new CustomEvent('NEXUS_WEIGHTS_UPDATED', {
          detail: { drawName, weights: normalized },
        })
      );

      // Synchroniser le store si le tirage actif correspond
      try {
        const { useNexusStore } = await import('../../store/useNexusStore');
        const activeDraw = useNexusStore.getState().drawName;
        if (activeDraw === drawName) {
          const currentStoreWeights = useNexusStore.getState().globalWeights;
          if (JSON.stringify(currentStoreWeights) !== JSON.stringify(normalized)) {
            useNexusStore.setState({ globalWeights: normalized });
          }
        }
      } catch (err) {
        // Silenced
      }
    }
    if (isSupabaseConfigured()) {
      await Promise.allSettled([
        supabase.from('algo_weights').upsert({ draw_name: drawName, weights: normalized, updated_at: new Date().toISOString() }),
        supabase.from('model_weights_config').upsert({ draw_name: drawName, weights: normalized, updated_at: new Date().toISOString() })
      ]);
    }
  } catch (e) { /* Silenced */ }
};

export const applyForensicCalibration = (
  currentWeights: AlgoWeights,
  suggestions: Array<{ algo: string, action: string, improvement: number }>,
  historyLength: number // Ajout pour dériver le damping
): AlgoWeights => {
  const newWeights = { ...currentWeights };
  const numAlgos = Object.keys(currentWeights).length || 1;
  
  // CORRECTION : Damping dérivé de l'inverse de la racine de la taille de l'historique (loi des grands nombres)
  // Plus l'historique est long, plus on fait confiance aux données réelles, moins on damp les ajustements.
  const dampingMin = 1.0 / numAlgos;
  const dampingMax = 1.0 / Math.sqrt(numAlgos);
  const damping = Math.max(dampingMin, Math.min(dampingMax, 1.0 / Math.sqrt(historyLength)));

  suggestions.forEach(s => {
    const change = (s.improvement / 100.0) * damping;
    if (s.action === 'SYNERGY') {
      const parts = s.algo.split('+').map(p => p.trim() as AlgoKey);
      parts.forEach(p => {
        if (newWeights[p] !== undefined) newWeights[p] = (newWeights[p] || 0) * (1.0 + (change / parts.length));
      });
    } else {
      const key = s.algo as AlgoKey;
      if (newWeights[key] === undefined) return;
      if (s.action === 'BOOST' || s.action === 'ISOLATE') {
        newWeights[key] = (newWeights[key] || 0) * (1.0 + change);
      } else if (s.action === 'REDUCE') {
        newWeights[key] = (newWeights[key] || 0) * (1.0 - change);
      }
    }
  });
  return normalizeWeights(newWeights);
};

/**
 * APPLIQUE UNE RÉTROACTION BAYÉSIENNE SUR LES POIDS D'ALGORITHMES LOCAUX
 * Basée sur la validation manuelle de l'opérateur (RLHF / Forensic Autopsy).
 * Ajuste les poids de façon continue et déterministe (sans nombre magique ni aléa).
 */
export const applyBayesianForensicFeedback = async (
  drawName: string,
  report: ForensicReport,
  userRating: "Visionnaire" | "Standard" | "Incohérente"
): Promise<AlgoWeights> => {
  const currentWeights = await getAlgoWeights(drawName);
  const newWeights = { ...currentWeights };
  
  // Facteur de feedback : 1.0 (Visionnaire), 0.0 (Standard), -1.0 (Incohérente)
  const feedbackScore = userRating === "Visionnaire" ? 1.0 : (userRating === "Incohérente" ? -1.0 : 0.0);
  
  // Si le feedback est neutre (Standard), pas de modification requise
  if (feedbackScore === 0.0) return currentWeights;

  const validKeys = Object.values(AlgoKey);
  const numAlgos = validKeys.length || 1;
  // Coefficient d'apprentissage bayésien dérivé pour préserver l'entropie
  const baseLR = 1.0 / (2.0 * numAlgos);
  
  if (report.proposedAdjustments && report.proposedAdjustments.length > 0) {
    report.proposedAdjustments.forEach((adj) => {
      const key = adj.algo as AlgoKey;
      if (!validKeys.includes(key) || newWeights[key] === undefined) return;
      
      // La dérive bayésienne ajuste le poids :
      // - Si feedbackScore > 0 (Visionnaire), on se déplace dans le sens de l'ajustement proposé.
      // - Si feedbackScore < 0 (Incohérente), on se déplace dans le sens opposé (pénalisation).
      const adjustment = adj.proposedWeightChange * feedbackScore * baseLR;
      
      // Loi de transition continue avec tangente hyperbolique (respect d'AGENTS.md)
      newWeights[key] = newWeights[key] * (1.0 + Math.tanh(adjustment));
    });
  } else if (report.counterfactuals && report.counterfactuals.length > 0) {
    // Si pas d'ajustements directs, on utilise les contrefactuels de performance
    report.counterfactuals.forEach((cf) => {
      if (cf.algo) {
        const key = cf.algo as AlgoKey;
        if (!validKeys.includes(key) || newWeights[key] === undefined) return;
        const change = (cf.rankImprovement || 1.0) / 100.0;
        const adjustment = change * feedbackScore * baseLR;
        newWeights[key] = newWeights[key] * (1.0 + Math.tanh(adjustment));
      }
    });
  }

  const finalNormalized = normalizeWeights(newWeights);
  await saveAlgoWeights(drawName, finalNormalized);
  
  return finalNormalized;
};

export interface CalibratedHyperparameters {
  sigmoid_slope: number;
  sigmoid_intercept: number;
  boosting_multiplier: number;
  prudence_mode_active: boolean;
}

export const getCalibratedHyperparameters = async (drawName: string, currentEntropy: number): Promise<CalibratedHyperparameters> => {
  const defaultParams = {
    sigmoid_slope: 1.2 - 0.8 * currentEntropy,
    sigmoid_intercept: -0.5 - 1.5 * currentEntropy,
    boosting_multiplier: 1.0,
    prudence_mode_active: false
  };

  if (!isSupabaseConfigured() || !navigator.onLine) {
    return defaultParams;
  }

  try {
    const { data } = await supabase
      .from('model_weights_config')
      .select('sigmoid_slope, sigmoid_intercept, boosting_multiplier, prudence_mode_active')
      .eq('draw_name', drawName)
      .maybeSingle();

    if (data) {
      return {
        sigmoid_slope: typeof data.sigmoid_slope === 'number' ? data.sigmoid_slope : defaultParams.sigmoid_slope,
        sigmoid_intercept: typeof data.sigmoid_intercept === 'number' ? data.sigmoid_intercept : defaultParams.sigmoid_intercept,
        boosting_multiplier: typeof data.boosting_multiplier === 'number' ? data.boosting_multiplier : defaultParams.boosting_multiplier,
        prudence_mode_active: !!data.prudence_mode_active
      };
    }
  } catch (e) { /* Silenced */ }

  return defaultParams;
};
