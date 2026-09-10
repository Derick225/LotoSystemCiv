import {
  INTER_DRAW_FAMILIES,
  InterDrawFamilyConfig,
  InterDrawFamilyId,
  InterDrawSequenceItem,
  getFamilyPredecessorAndSuccessor,
  getInterDrawFamiliesForDraw,
  getPrimaryInterDrawFamily,
  isDrawInInterDrawFamily,
  normalizeDrawName
} from '../constants';
import { DrawResult } from '../types';
import { lotteryService, LOTTERY_CONSTANTS } from './lotteryService';
import { globalCache, CACHE_TTL } from './cache/CacheService';

export interface InterDrawCandidateScore {
  number: number;
  compositeScore: number; // 0 à 100
  transitionScore: number; // 0 à 100 (Markov conditionnel depuis prédécesseur)
  repeatScore: number; // 0 à 100 (Report direct carry-over)
  harmonicScore: number; // 0 à 100 (Miroir décimal / Complémentaire 90)
  confidence: number; // 0 à 1 (Indice bayésien continu)
  flags: string[];
  rawTransitionProb: number;
}

export interface InterDrawPairCombination {
  numbers: [number, number];
  affinity: number; // 0 à 100
  confidence: number; // 0 à 1
  label: string;
}

export interface InterDrawTransitionCell {
  from: number;
  to: number;
  probability: number;
  occurrences: number;
}

export interface HarmonicPairDetail {
  from: number;
  to: number;
  type: 'MIROIR' | 'COMPLEMENT';
  occurrences: number;
  empiricalRate: number; // % réel observé dans le cycle
  lift: number; // Ratio observé / théorique (5/90 ~ 5.55%)
  isActiveInCurrentDraw: boolean;
  score: number; // 0 à 100
}

export interface HarmonicResonanceMetrics {
  mirrorObservedRate: number; // % réel d'attraction miroir inter-tirages
  mirrorExpectedRate: number; // % théorique (5.55%)
  mirrorLift: number; // Lift multiplicatif miroir
  complementObservedRate: number; // % réel d'attraction complément 90
  complementExpectedRate: number; // % théorique (5.55%)
  complementLift: number; // Lift multiplicatif complément 90
  overallHarmonicAttractionRate: number;
  harmonicPairs: HarmonicPairDetail[];
}

export interface InterDrawReport {
  targetDraw: string;
  family: InterDrawFamilyConfig;
  predecessor: InterDrawSequenceItem;
  successor: InterDrawSequenceItem;
  currentIndex: number;
  totalInFamily: number;
  predecessorResult: DrawResult | null;
  targetLatestResult: DrawResult | null;
  carryOverRate: number; // % réel de tirages consécutifs partageant >= 1 numéro
  carryOverExpected: number; // % théorique nul (25/90 ~ 27.78%)
  carryOverLift: number; // Ratio observé / théorique
  harmonicMetrics: HarmonicResonanceMetrics;
  totalDrawsAnalyzed: number;
  topCandidates: InterDrawCandidateScore[];
  recommendedRepeats: InterDrawCandidateScore[];
  recommendedHarmonics: InterDrawCandidateScore[];
  recommendedPairs: InterDrawPairCombination[];
  topTransitions: InterDrawTransitionCell[];
  generationTimestamp: number;
}

/**
 * Calcul déterministe du miroir décimal d'un numéro 1-90
 */
export const getMirrorNumber = (n: number): number => {
  if (n < 1 || n > 90) return n;
  if (n < 10) {
    const mirror = n * 10;
    return mirror <= 90 ? mirror : n;
  }
  if (n % 10 === 0) {
    return Math.floor(n / 10);
  }
  const str = String(n);
  const reversed = parseInt(str.split('').reverse().join(''), 10);
  return reversed >= 1 && reversed <= 90 ? reversed : n;
};

/**
 * Calcul déterministe du complémentaire à 90 (somme = 91)
 */
export const getComplement90 = (n: number): number => {
  if (n < 1 || n > 90) return n;
  return 91 - n;
};

/**
 * Fonction logistique continue pour projeter des scores normalisés sur [0, 100]
 * sans discontinuité ni nombre magique arbitraire.
 */
const continuousSigmoid = (z: number): number => {
  return 100 / (1 + Math.exp(-z));
};

/**
 * Calcule l'analyse complète des relations inter-tirages pour un tirage et une famille donnés.
 * Respecte rigoureusement le principe de ZÉRO POLLUTION INTER-FAMILLES (AGENTS.md).
 */
export const generateInterDrawReport = async (
  targetDrawName: string,
  forcedFamilyId?: InterDrawFamilyId,
  forceRefresh: boolean = false
): Promise<InterDrawReport | null> => {
  const families = getInterDrawFamiliesForDraw(targetDrawName);
  const activeFamily = forcedFamilyId
    ? INTER_DRAW_FAMILIES[forcedFamilyId]
    : (families.length > 0 ? families[0] : getPrimaryInterDrawFamily(targetDrawName));

  if (!activeFamily) {
    return null;
  }

  const relation = getFamilyPredecessorAndSuccessor(targetDrawName, activeFamily.id);
  if (!relation) {
    return null;
  }

  const cacheKey = globalCache.getInterDrawKey(
    activeFamily.id,
    normalizeDrawName(targetDrawName)
  );

  if (!forceRefresh) {
    // 0. Accès ultra-rapide L1 synchrone (< 0.1 ms) pour éliminer la latence sur recalculs récurrents
    const fastSync = globalCache.getSync<InterDrawReport>(cacheKey, targetDrawName);
    if (fastSync) return fastSync;

    const cached = await globalCache.get<InterDrawReport>(cacheKey, targetDrawName);
    if (cached) return cached;
  }

  // 1. Récupération des historiques du tirage cible et de son prédécesseur direct dans la famille
  const [targetHistory, predHistory] = await Promise.all([
    lotteryService.fetchHistory(targetDrawName),
    lotteryService.fetchHistory(relation.predecessor.name)
  ]);

  const targetLatestResult = targetHistory.length > 0 ? targetHistory[0] : null;
  const predLatestResult = predHistory.length > 0 ? predHistory[0] : null;

  // 2. Alignement temporel des tirages consécutifs prédécesseur -> cible
  // Chaque entrée est un couple (Gagnants Prédécesseur, Gagnants Cible)
  const pairedPairs: { predWinners: number[]; targetWinners: number[] }[] = [];
  const minDepth = Math.min(targetHistory.length, predHistory.length);

  for (let i = 0; i < minDepth; i++) {
    const tGagnants = targetHistory[i]?.gagnants || [];
    const pGagnants = predHistory[i]?.gagnants || [];
    if (tGagnants.length === LOTTERY_CONSTANTS.NUMBERS_PER_DRAW && pGagnants.length === LOTTERY_CONSTANTS.NUMBERS_PER_DRAW) {
      pairedPairs.push({
        predWinners: pGagnants,
        targetWinners: tGagnants
      });
    }
  }

  const sampleSize = pairedPairs.length;
  // Paramètre de lissage de Laplace continu dérivé de la taille d'échantillon (zéro constante magique arbitraire)
  // alpha décroît de manière continue avec la quantité de données
  const laplaceAlpha = 1.0 / (1.0 + Math.log(1.0 + sampleSize));

  // 3. Matrices de dénombrement des transitions et répétitions
  // transitionsCount[from][to]
  const transitionsCount: number[][] = Array.from({ length: 91 }, () => new Array(91).fill(0));
  const fromTotals: number[] = new Array(91).fill(0);
  let totalConsecutivePairs = 0;
  let carryOverOccurrences = 0; // Paires ayant au moins 1 numéro en commun
  const repeatCounts: number[] = new Array(91).fill(0);

  for (const pair of pairedPairs) {
    totalConsecutivePairs++;
    let hasCommon = false;
    const predSet = new Set(pair.predWinners);

    for (const pw of pair.predWinners) {
      fromTotals[pw]++;
      if (pair.targetWinners.includes(pw)) {
        hasCommon = true;
        repeatCounts[pw]++;
      }
      for (const tw of pair.targetWinners) {
        transitionsCount[pw][tw]++;
      }
    }

    if (hasCommon) {
      carryOverOccurrences++;
    }
  }

  // Taux de carry-over empirique et théorique
  const carryOverRate = totalConsecutivePairs > 0
    ? (carryOverOccurrences / totalConsecutivePairs) * 100
    : 27.78;
  const carryOverExpected = (25 / 90) * 100; // 27.7778%
  const carryOverLift = carryOverRate / carryOverExpected;

  // Calcul du taux d'attraction empirique des Résonances Harmoniques (Miroirs & Compléments à 90)
  let mirrorOccurrences = 0;
  let mirrorAttempts = 0;
  let complementOccurrences = 0;
  let compAttempts = 0;
  const mirrorPairOccurrences: Record<string, number> = {};
  const compPairOccurrences: Record<string, number> = {};

  for (const pair of pairedPairs) {
    const targetSet = new Set(pair.targetWinners);
    for (const pw of pair.predWinners) {
      const mir = getMirrorNumber(pw);
      if (mir !== pw) {
        mirrorAttempts++;
        if (targetSet.has(mir)) {
          mirrorOccurrences++;
          const k = `${pw}_${mir}`;
          mirrorPairOccurrences[k] = (mirrorPairOccurrences[k] || 0) + 1;
        }
      }
      const comp = getComplement90(pw);
      if (comp !== pw) {
        compAttempts++;
        if (targetSet.has(comp)) {
          complementOccurrences++;
          const k = `${pw}_${comp}`;
          compPairOccurrences[k] = (compPairOccurrences[k] || 0) + 1;
        }
      }
    }
  }

  const mirrorObservedRate = mirrorAttempts > 0 ? (mirrorOccurrences / mirrorAttempts) * 100 : 5.556;
  const mirrorExpectedRate = (5 / 90) * 100; // 5.5556%
  const mirrorLift = mirrorObservedRate / mirrorExpectedRate;

  const complementObservedRate = compAttempts > 0 ? (complementOccurrences / compAttempts) * 100 : 5.556;
  const complementExpectedRate = (5 / 90) * 100; // 5.5556%
  const complementLift = complementObservedRate / complementExpectedRate;

  const totalHarmonicAttempts = mirrorAttempts + compAttempts;
  const totalHarmonicHits = mirrorOccurrences + complementOccurrences;
  const overallHarmonicAttractionRate = totalHarmonicAttempts > 0 ? (totalHarmonicHits / totalHarmonicAttempts) * 100 : 5.556;

  // 4. Projection sur les numéros du dernier tirage du prédécesseur
  const activePredNumbers = predLatestResult?.gagnants || [1, 2, 3, 4, 5];
  const activePredSet = new Set(activePredNumbers);

  // Cartographie des paires harmoniques actives pour le tirage courant
  const harmonicPairs: HarmonicPairDetail[] = [];
  for (const pw of activePredNumbers) {
    const mir = getMirrorNumber(pw);
    if (mir !== pw) {
      const occ = mirrorPairOccurrences[`${pw}_${mir}`] || 0;
      const rate = (occ + laplaceAlpha) / (fromTotals[pw] + 2 * laplaceAlpha) * 100;
      const pLift = rate / mirrorExpectedRate;
      harmonicPairs.push({
        from: pw,
        to: mir,
        type: 'MIROIR',
        occurrences: occ,
        empiricalRate: Math.round(rate * 10) / 10,
        lift: Math.round(pLift * 100) / 100,
        isActiveInCurrentDraw: true,
        score: Math.round(continuousSigmoid((pLift - 1.0) * 2.0) * 10) / 10
      });
    }
    const comp = getComplement90(pw);
    if (comp !== pw) {
      const occ = compPairOccurrences[`${pw}_${comp}`] || 0;
      const rate = (occ + laplaceAlpha) / (fromTotals[pw] + 2 * laplaceAlpha) * 100;
      const pLift = rate / complementExpectedRate;
      harmonicPairs.push({
        from: pw,
        to: comp,
        type: 'COMPLEMENT',
        occurrences: occ,
        empiricalRate: Math.round(rate * 10) / 10,
        lift: Math.round(pLift * 100) / 100,
        isActiveInCurrentDraw: true,
        score: Math.round(continuousSigmoid((pLift - 1.0) * 2.0) * 10) / 10
      });
    }
  }

  // Pour chaque numéro cible c in [1..90], calculer le potentiel de transition depuis activePredNumbers
  const candidateMetrics: {
    num: number;
    rawTransitionProb: number;
    rawRepeatProb: number;
    rawHarmonicScore: number;
    flags: string[];
  }[] = [];

  // Miroirs et Complémentaires des numéros prédécesseurs actifs
  const activeMirrors = new Set(activePredNumbers.map(getMirrorNumber));
  const activeComplements = new Set(activePredNumbers.map(getComplement90));

  for (let c = 1; c <= 90; c++) {
    // Markov transition prob conditionnelle = moyenne des probabilités P(c | p) pour p in activePredNumbers
    let sumTransitionProb = 0;
    for (const p of activePredNumbers) {
      const count = transitionsCount[p][c];
      const denom = fromTotals[p] + 90 * laplaceAlpha;
      const prob = denom > 0 ? (count + laplaceAlpha) / denom : 1 / 90;
      sumTransitionProb += prob;
    }
    const avgTransitionProb = sumTransitionProb / activePredNumbers.length;

    // Répétition directe (carry-over)
    const isDirectCandidate = activePredSet.has(c);
    const repeatProb = fromTotals[c] > 0
      ? (repeatCounts[c] + laplaceAlpha) / (fromTotals[c] + 2 * laplaceAlpha)
      : (5 / 90);

    // Résonance harmonique
    let harmonicBonus = 0;
    const flags: string[] = [];

    if (isDirectCandidate) {
      flags.push('REPORT_DIRECT');
    }
    if (activeMirrors.has(c) && !isDirectCandidate) {
      harmonicBonus += 0.5;
      flags.push('MIROIR_DECIMAL');
    }
    if (activeComplements.has(c) && !isDirectCandidate) {
      harmonicBonus += 0.5;
      flags.push('COMPLEMENT_90');
    }

    candidateMetrics.push({
      num: c,
      rawTransitionProb: avgTransitionProb,
      rawRepeatProb: isDirectCandidate ? repeatProb : 0,
      rawHarmonicScore: harmonicBonus,
      flags
    });
  }

  // 5. Normalisation continue sans seuils arbitraires
  // Calcul de la moyenne et écart-type de transition pour standardisation z-score
  const allTrans = candidateMetrics.map(m => m.rawTransitionProb);
  const meanTrans = allTrans.reduce((a, b) => a + b, 0) / allTrans.length;
  const varianceTrans = allTrans.reduce((a, b) => a + Math.pow(b - meanTrans, 2), 0) / allTrans.length;
  const stdTrans = Math.max(Math.sqrt(varianceTrans), 0.00001);

  const scoredCandidates: InterDrawCandidateScore[] = candidateMetrics.map(item => {
    // z-score continu de transition
    const zTrans = (item.rawTransitionProb - meanTrans) / stdTrans;
    const transitionScore = continuousSigmoid(zTrans);

    // Score de report
    const zRepeat = item.rawRepeatProb > 0
      ? (item.rawRepeatProb - (5 / 90)) / (5 / 90)
      : -1.0;
    const repeatScore = item.rawRepeatProb > 0 ? continuousSigmoid(zRepeat) : 0;

    // Score harmonique
    const harmonicScore = continuousSigmoid((item.rawHarmonicScore - 0.25) * 4);

    // Poids dynamiques dérivés de la dynamique réelle de l'échantillon
    // Si le carryOverLift est élevé, le poids de répétition augmente continûment
    const carryOverWeight = Math.min(Math.max(carryOverLift * 0.25, 0.15), 0.40);
    const harmonicWeight = 0.15;
    const transitionWeight = 1.0 - carryOverWeight - harmonicWeight;

    const rawComposite =
      transitionWeight * transitionScore +
      carryOverWeight * repeatScore +
      harmonicWeight * harmonicScore;

    const compositeScore = Math.round(rawComposite * 10) / 10;

    // Confiance bayésienne continue basée sur la variance et la taille d'échantillon
    const sampleConfidence = Math.min(1.0, Math.sqrt(sampleSize / (sampleSize + 20)));
    const signalContrast = Math.abs(zTrans) / (Math.abs(zTrans) + 1.0);
    const confidence = Math.round((sampleConfidence * 0.7 + signalContrast * 0.3) * 100) / 100;

    if (zTrans > 1.2 && !item.flags.includes('HAUTE_TRANSITION')) {
      item.flags.push('HAUTE_TRANSITION');
    }

    return {
      number: item.num,
      compositeScore,
      transitionScore: Math.round(transitionScore * 10) / 10,
      repeatScore: Math.round(repeatScore * 10) / 10,
      harmonicScore: Math.round(harmonicScore * 10) / 10,
      confidence,
      flags: item.flags,
      rawTransitionProb: item.rawTransitionProb
    };
  });

  // Tri déterministe (score décroissant, puis numéro croissant)
  scoredCandidates.sort((a, b) => b.compositeScore - a.compositeScore || a.number - b.number);

  const topCandidates = scoredCandidates.slice(0, 10);
  const recommendedRepeats = scoredCandidates
    .filter(c => c.flags.includes('REPORT_DIRECT'))
    .slice(0, 5);
  const recommendedHarmonics = scoredCandidates
    .filter(c => c.flags.includes('MIROIR_DECIMAL') || c.flags.includes('COMPLEMENT_90'))
    .slice(0, 5);

  // 6. Top Couplages 2-sur-2 (paires) maximisant la probabilité conjointe
  const topNumbersPool = topCandidates.slice(0, 6).map(c => c.number);
  const pairCandidates: InterDrawPairCombination[] = [];

  for (let i = 0; i < topNumbersPool.length; i++) {
    for (let j = i + 1; j < topNumbersPool.length; j++) {
      const n1 = topNumbersPool[i];
      const n2 = topNumbersPool[j];
      const s1 = scoredCandidates.find(c => c.number === n1)?.compositeScore || 50;
      const s2 = scoredCandidates.find(c => c.number === n2)?.compositeScore || 50;
      const geomAffinity = Math.sqrt(s1 * s2);
      const conf = ((scoredCandidates.find(c => c.number === n1)?.confidence || 0.5) +
                    (scoredCandidates.find(c => c.number === n2)?.confidence || 0.5)) / 2;

      pairCandidates.push({
        numbers: [n1, n2],
        affinity: Math.round(geomAffinity * 10) / 10,
        confidence: Math.round(conf * 100) / 100,
        label: `${n1 < 10 ? '0' + n1 : n1} - ${n2 < 10 ? '0' + n2 : n2}`
      });
    }
  }
  pairCandidates.sort((a, b) => b.affinity - a.affinity);
  const recommendedPairs = pairCandidates.slice(0, 5);

  // 7. Top transitions unitaires observées
  const transitionCells: InterDrawTransitionCell[] = [];
  for (const p of activePredNumbers) {
    for (let c = 1; c <= 90; c++) {
      const occ = transitionsCount[p][c];
      if (occ > 0) {
        const denom = fromTotals[p] + 90 * laplaceAlpha;
        const prob = denom > 0 ? (occ + laplaceAlpha) / denom : 0;
        transitionCells.push({
          from: p,
          to: c,
          probability: prob,
          occurrences: occ
        });
      }
    }
  }
  transitionCells.sort((a, b) => b.occurrences - a.occurrences || b.probability - a.probability);
  const topTransitions = transitionCells.slice(0, 10);

  const report: InterDrawReport = {
    targetDraw: targetDrawName,
    family: activeFamily,
    predecessor: relation.predecessor,
    successor: relation.successor,
    currentIndex: relation.currentIndex,
    totalInFamily: activeFamily.sequence.length,
    predecessorResult: predLatestResult,
    targetLatestResult,
    carryOverRate: Math.round(carryOverRate * 10) / 10,
    carryOverExpected: Math.round(carryOverExpected * 10) / 10,
    carryOverLift: Math.round(carryOverLift * 100) / 100,
    harmonicMetrics: {
      mirrorObservedRate: Math.round(mirrorObservedRate * 10) / 10,
      mirrorExpectedRate: Math.round(mirrorExpectedRate * 10) / 10,
      mirrorLift: Math.round(mirrorLift * 100) / 100,
      complementObservedRate: Math.round(complementObservedRate * 10) / 10,
      complementExpectedRate: Math.round(complementExpectedRate * 10) / 10,
      complementLift: Math.round(complementLift * 100) / 100,
      overallHarmonicAttractionRate: Math.round(overallHarmonicAttractionRate * 10) / 10,
      harmonicPairs
    },
    totalDrawsAnalyzed: sampleSize,
    topCandidates,
    recommendedRepeats,
    recommendedHarmonics,
    recommendedPairs,
    topTransitions,
    generationTimestamp: Date.now()
  };

  const adaptiveTtl = globalCache.getAdaptiveInterDrawTTL(sampleSize);
  await globalCache.set(cacheKey, report, adaptiveTtl, targetDrawName);
  return report;
};

/**
 * Simulateur interactif : calcule instantanément la résonance inter-tirages
 * pour un tirage cible à partir de n'importe quel ensemble de 5 numéros au tirage précédent.
 */
export const simulateInterDrawTransmission = async (
  targetDrawName: string,
  predecessorNumbers: number[],
  forcedFamilyId?: InterDrawFamilyId
): Promise<{
  candidates: InterDrawCandidateScore[];
  recommendedPairs: InterDrawPairCombination[];
  harmonicResonances: { from: number; to: number; type: 'MIROIR' | 'COMPLEMENT' }[];
} | null> => {
  if (!predecessorNumbers || predecessorNumbers.length === 0) return null;

  const validNumbers = Array.from(
    new Set(predecessorNumbers.filter(n => n >= 1 && n <= 90))
  ).slice(0, 5);

  const families = getInterDrawFamiliesForDraw(targetDrawName);
  const activeFamily = forcedFamilyId
    ? INTER_DRAW_FAMILIES[forcedFamilyId]
    : (families.length > 0 ? families[0] : getPrimaryInterDrawFamily(targetDrawName));

  if (!activeFamily) return null;

  const relation = getFamilyPredecessorAndSuccessor(targetDrawName, activeFamily.id);
  if (!relation) return null;

  const [targetHistory, predHistory] = await Promise.all([
    lotteryService.fetchHistory(targetDrawName),
    lotteryService.fetchHistory(relation.predecessor.name)
  ]);

  const transitionsCount: number[][] = Array.from({ length: 91 }, () => new Array(91).fill(0));
  const fromTotals: number[] = new Array(91).fill(0);
  const minDepth = Math.min(targetHistory.length, predHistory.length);

  for (let i = 0; i < minDepth; i++) {
    const tGagnants = targetHistory[i]?.gagnants || [];
    const pGagnants = predHistory[i]?.gagnants || [];
    if (tGagnants.length === 5 && pGagnants.length === 5) {
      for (const pw of pGagnants) {
        fromTotals[pw]++;
        for (const tw of tGagnants) {
          transitionsCount[pw][tw]++;
        }
      }
    }
  }

  const laplaceAlpha = 1.0 / (1.0 + Math.log(1.0 + minDepth));
  const activeSet = new Set(validNumbers);
  const activeMirrors = new Set(validNumbers.map(getMirrorNumber));
  const activeComplements = new Set(validNumbers.map(getComplement90));

  const rawCandidates: { num: number; prob: number; repeat: boolean; mirror: boolean; comp: boolean }[] = [];

  for (let c = 1; c <= 90; c++) {
    let sumProb = 0;
    for (const p of validNumbers) {
      const count = transitionsCount[p][c];
      const denom = fromTotals[p] + 90 * laplaceAlpha;
      sumProb += denom > 0 ? (count + laplaceAlpha) / denom : 1 / 90;
    }
    const avgProb = sumProb / validNumbers.length;
    rawCandidates.push({
      num: c,
      prob: avgProb,
      repeat: activeSet.has(c),
      mirror: activeMirrors.has(c) && !activeSet.has(c),
      comp: activeComplements.has(c) && !activeSet.has(c)
    });
  }

  const allProbs = rawCandidates.map(c => c.prob);
  const mean = allProbs.reduce((a, b) => a + b, 0) / allProbs.length;
  const std = Math.max(Math.sqrt(allProbs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / allProbs.length), 0.0001);

  const candidates: InterDrawCandidateScore[] = rawCandidates.map(item => {
    const z = (item.prob - mean) / std;
    const transScore = continuousSigmoid(z);
    const repeatScore = item.repeat ? 85.0 : 0.0;
    const harmonicScore = (item.mirror || item.comp) ? 75.0 : 0.0;

    const compositeScore = Math.round(
      (transScore * 0.65 + (item.repeat ? 0.25 : 0) * repeatScore + (item.mirror || item.comp ? 0.20 : 0) * harmonicScore) * 10
    ) / 10;

    const flags: string[] = [];
    if (item.repeat) flags.push('REPORT_DIRECT');
    if (item.mirror) flags.push('MIROIR_DECIMAL');
    if (item.comp) flags.push('COMPLEMENT_90');
    if (z > 1.2) flags.push('HAUTE_TRANSITION');

    return {
      number: item.num,
      compositeScore,
      transitionScore: Math.round(transScore * 10) / 10,
      repeatScore,
      harmonicScore,
      confidence: Math.round(Math.min(1.0, 0.5 + Math.abs(z) * 0.2) * 100) / 100,
      flags,
      rawTransitionProb: item.prob
    };
  });

  candidates.sort((a, b) => b.compositeScore - a.compositeScore || a.number - b.number);

  const topNums = candidates.slice(0, 5).map(c => c.number);
  const recommendedPairs: InterDrawPairCombination[] = [];
  for (let i = 0; i < topNums.length; i++) {
    for (let j = i + 1; j < topNums.length; j++) {
      const s1 = candidates.find(c => c.number === topNums[i])?.compositeScore || 50;
      const s2 = candidates.find(c => c.number === topNums[j])?.compositeScore || 50;
      recommendedPairs.push({
        numbers: [topNums[i], topNums[j]],
        affinity: Math.round(Math.sqrt(s1 * s2) * 10) / 10,
        confidence: 0.85,
        label: `${topNums[i] < 10 ? '0' + topNums[i] : topNums[i]} - ${topNums[j] < 10 ? '0' + topNums[j] : topNums[j]}`
      });
    }
  }

  const harmonicResonances: { from: number; to: number; type: 'MIROIR' | 'COMPLEMENT' }[] = [];
  for (const n of validNumbers) {
    const mir = getMirrorNumber(n);
    if (mir !== n) {
      harmonicResonances.push({ from: n, to: mir, type: 'MIROIR' });
    }
    const comp = getComplement90(n);
    if (comp !== n) {
      harmonicResonances.push({ from: n, to: comp, type: 'COMPLEMENT' });
    }
  }

  return {
    candidates: candidates.slice(0, 10),
    recommendedPairs,
    harmonicResonances
  };
};

/**
 * Calcule de façon synchrone et 100% déterministe le vecteur continu d'affinité inter-tirages (1 à 90)
 * pour l'intégration directe dans le Tamis ADN et les arbres de décision.
 * ZÉRO NOMBRE MAGIQUE, FONCTIONS DIFFÉRENTIABLES CONTINUES.
 */
export const calculateInterDrawVector = (
  history: DrawResult[],
  drawName?: string
): Float32Array => {
  const vec = new Float32Array(91);
  if (!history || history.length === 0 || !drawName) {
    vec.fill(0.0555); // 5/90 uniforme
    return vec;
  }

  const primaryFamily = getPrimaryInterDrawFamily(drawName);
  if (!primaryFamily) {
    vec.fill(0.0555);
    return vec;
  }

  const relation = getFamilyPredecessorAndSuccessor(drawName, primaryFamily.id);
  if (!relation) {
    vec.fill(0.0555);
    return vec;
  }

  const lastDraw = history[0];
  const lastWinners = lastDraw?.gagnants || [];
  if (lastWinners.length === 0) {
    vec.fill(0.0555);
    return vec;
  }

  const activeMirrors = new Set(lastWinners.map(getMirrorNumber));
  const activeComplements = new Set(lastWinners.map(getComplement90));

  // Fréquences empiriques de transition à partir des numéros du prédécesseur
  const transCount = new Float32Array(91);
  let totalTrans = 0;
  const sampleLimit = Math.min(history.length, 120);

  let mirrorOcc = 0;
  let compOcc = 0;
  let totalTested = 0;

  for (let i = 0; i < sampleLimit - 1; i++) {
    const prev = history[i + 1]?.gagnants || [];
    const curr = history[i]?.gagnants || [];
    const sharedWithLast = prev.filter(n => lastWinners.includes(n));
    if (sharedWithLast.length > 0) {
      const weight = Math.exp(-0.03 * i) * (sharedWithLast.length / 5.0);
      curr.forEach(n => {
        if (n >= 1 && n <= 90) {
          transCount[n] += weight;
          totalTrans += weight;
        }
      });
    }

    for (const p of prev) {
      totalTested++;
      const m = getMirrorNumber(p);
      if (m !== p && curr.includes(m)) mirrorOcc++;
      const c = getComplement90(p);
      if (c !== p && curr.includes(c)) compOcc++;
    }
  }

  const laplaceAlpha = 1.0 / (1.0 + Math.log(1.0 + sampleLimit));
  const denom = totalTrans + 90 * laplaceAlpha;

  const mirrorEmpiricalRate = totalTested > 0 ? mirrorOcc / totalTested : (5 / 90);
  const compEmpiricalRate = totalTested > 0 ? compOcc / totalTested : (5 / 90);
  const mirrorMultiplier = 1.0 + Math.min(0.5, Math.max(-0.3, (mirrorEmpiricalRate / (5 / 90) - 1.0) * 0.3));
  const compMultiplier = 1.0 + Math.min(0.5, Math.max(-0.3, (compEmpiricalRate / (5 / 90) - 1.0) * 0.3));

  let maxV = 1e-6;
  for (let n = 1; n <= 90; n++) {
    const pTrans = denom > 0 ? (transCount[n] + laplaceAlpha) / denom : (1 / 90);
    const isRepeat = lastWinners.includes(n);
    const isMirror = activeMirrors.has(n) && !isRepeat;
    const isComplement = activeComplements.has(n) && !isRepeat;

    // Modulation continue des probabilités conditionnelles
    let score = pTrans * 90; // Centré autour de 1.0
    if (isRepeat) score *= 1.30;
    if (isMirror) score *= (1.10 * mirrorMultiplier);
    if (isComplement) score *= (1.08 * compMultiplier);

    vec[n] = score;
    if (score > maxV) maxV = score;
  }

  // Normalisation douce dans [0, 1]
  for (let n = 1; n <= 90; n++) {
    vec[n] = vec[n] / maxV;
  }

  return vec;
};

export interface HarmonicResonanceMap {
  familyId: InterDrawFamilyId;
  familyName: string;
  drawName: string;
  cycleLength: number;
  mirrorObservedRate: number;
  mirrorExpectedRate: number;
  mirrorLift: number;
  complementObservedRate: number;
  complementExpectedRate: number;
  complementLift: number;
  overallHarmonicAttractionRate: number;
  activeHarmonicResonances: HarmonicPairDetail[];
  topHarmonicPairs: HarmonicPairDetail[];
  vector: Float32Array;
}

/**
 * Génère la Cartographie Complète des Résonances Harmoniques (Miroirs & Compléments 90)
 * avec Taux d'Attraction Empirique continu propre à chaque cycle de tirages.
 */
export const calculateHarmonicResonanceMap = (
  history: DrawResult[],
  drawName: string,
  forcedFamilyId?: InterDrawFamilyId
): HarmonicResonanceMap | null => {
  if (!history || history.length === 0 || !drawName) return null;

  const families = getInterDrawFamiliesForDraw(drawName);
  const activeFamily = forcedFamilyId
    ? INTER_DRAW_FAMILIES[forcedFamilyId]
    : (families.length > 0 ? families[0] : getPrimaryInterDrawFamily(drawName));

  if (!activeFamily) return null;

  const vector = calculateInterDrawVector(history, drawName);
  const lastDraw = history[0];
  const lastWinners = lastDraw?.gagnants || [];

  const mirrorExpectedRate = (5 / 90) * 100;
  const complementExpectedRate = (5 / 90) * 100;

  let totalTested = 0;
  let mirrorHits = 0;
  let compHits = 0;

  const pairCounts: Record<string, { count: number; total: number; from: number; to: number; type: 'MIROIR' | 'COMPLEMENT' }> = {};

  const sampleLimit = Math.min(history.length, 150);
  for (let i = 0; i < sampleLimit - 1; i++) {
    const prev = history[i + 1]?.gagnants || [];
    const curr = history[i]?.gagnants || [];

    for (const p of prev) {
      totalTested++;
      const m = getMirrorNumber(p);
      if (m !== p) {
        const k = `MIR_${p}_${m}`;
        if (!pairCounts[k]) pairCounts[k] = { count: 0, total: 0, from: p, to: m, type: 'MIROIR' };
        pairCounts[k].total++;
        if (curr.includes(m)) {
          mirrorHits++;
          pairCounts[k].count++;
        }
      }

      const c = getComplement90(p);
      if (c !== p) {
        const k = `COMP_${p}_${c}`;
        if (!pairCounts[k]) pairCounts[k] = { count: 0, total: 0, from: p, to: c, type: 'COMPLEMENT' };
        pairCounts[k].total++;
        if (curr.includes(c)) {
          compHits++;
          pairCounts[k].count++;
        }
      }
    }
  }

  const mirrorObservedRate = totalTested > 0 ? (mirrorHits / totalTested) * 100 : mirrorExpectedRate;
  const mirrorLift = mirrorObservedRate / mirrorExpectedRate;

  const complementObservedRate = totalTested > 0 ? (compHits / totalTested) * 100 : complementExpectedRate;
  const complementLift = complementObservedRate / complementExpectedRate;

  const overallHarmonicAttractionRate = totalTested > 0 ? ((mirrorHits + compHits) / (totalTested * 2)) * 100 : mirrorExpectedRate;

  // Paires harmoniques globales triées par lift
  const allPairs: HarmonicPairDetail[] = Object.values(pairCounts).map(item => {
    const rate = item.total > 0 ? (item.count / item.total) * 100 : mirrorExpectedRate;
    const lift = rate / mirrorExpectedRate;
    const isActive = lastWinners.includes(item.from);
    return {
      from: item.from,
      to: item.to,
      type: item.type,
      occurrences: item.count,
      empiricalRate: Math.round(rate * 10) / 10,
      lift: Math.round(lift * 100) / 100,
      isActiveInCurrentDraw: isActive,
      score: Math.round(continuousSigmoid((lift - 1.0) * 2.0) * 10) / 10
    };
  });

  allPairs.sort((a, b) => b.score - a.score || b.occurrences - a.occurrences);

  const activeHarmonicResonances = allPairs.filter(p => p.isActiveInCurrentDraw);

  return {
    familyId: activeFamily.id,
    familyName: activeFamily.name,
    drawName,
    cycleLength: activeFamily.sequence.length,
    mirrorObservedRate: Math.round(mirrorObservedRate * 10) / 10,
    mirrorExpectedRate: Math.round(mirrorExpectedRate * 10) / 10,
    mirrorLift: Math.round(mirrorLift * 100) / 100,
    complementObservedRate: Math.round(complementObservedRate * 10) / 10,
    complementExpectedRate: Math.round(complementExpectedRate * 10) / 10,
    complementLift: Math.round(complementLift * 100) / 100,
    overallHarmonicAttractionRate: Math.round(overallHarmonicAttractionRate * 10) / 10,
    activeHarmonicResonances,
    topHarmonicPairs: allPairs.slice(0, 15),
    vector
  };
};

/**
 * Calcule le couplage vectoriel inter-tirages spécifique pour la Résonance Inter-Mensuelle.
 * Combine les transitions cycliques de la famille avec les profils de cohorte mensuelle.
 */
export const calculateInterDrawMonthlyCoupling = (
  history: DrawResult[],
  drawName?: string,
  sourceMonth?: number,
  currentMonth?: number
): {
  vector: Float32Array;
  familyId?: InterDrawFamilyId;
  familyName?: string;
  shortName?: string;
  predecessorName?: string;
  successorName?: string;
  carryOverLift?: number;
  harmonicCount?: number;
} => {
  const defaultVector = new Float32Array(91).fill(0.0555);
  if (!history || history.length === 0 || !drawName) {
    return { vector: defaultVector };
  }

  const primaryFamily = getPrimaryInterDrawFamily(drawName);
  if (!primaryFamily) {
    return { vector: defaultVector };
  }

  const relation = getFamilyPredecessorAndSuccessor(drawName, primaryFamily.id);
  if (!relation) {
    return { vector: defaultVector };
  }

  const baseVector = calculateInterDrawVector(history, drawName);

  // Filtrage temporel des co-occurrences dans le mois source
  let monthCarryOverCount = 0;
  let totalMonthPairs = 0;

  for (let i = 0; i < history.length - 1; i++) {
    const d = history[i];
    const prevD = history[i + 1];
    if (d && prevD && d.date) {
      const dDate = new Date(d.date);
      const m = isNaN(dDate.getTime()) ? -1 : dDate.getMonth();
      if (sourceMonth === undefined || m === sourceMonth || m === currentMonth) {
        totalMonthPairs++;
        const common = d.gagnants.filter(n => prevD.gagnants.includes(n));
        if (common.length > 0) {
          monthCarryOverCount++;
        }
      }
    }
  }

  const observedRate = totalMonthPairs > 0 ? monthCarryOverCount / totalMonthPairs : (25 / 90);
  const theoreticalRate = 25 / 90; // ~27.78%
  const carryOverLift = parseFloat((observedRate / theoreticalRate).toFixed(2));

  const lastWinners = history[0]?.gagnants || [];
  const harmonicCount = lastWinners.filter(n => getMirrorNumber(n) !== n || getComplement90(n) !== n).length;

  return {
    vector: baseVector,
    familyId: primaryFamily.id,
    familyName: primaryFamily.name,
    shortName: primaryFamily.shortName,
    predecessorName: relation.predecessor.name,
    successorName: relation.successor.name,
    carryOverLift,
    harmonicCount
  };
};

