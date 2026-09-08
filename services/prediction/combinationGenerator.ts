import { EmpiricalCalibration, FALLBACK_CALIBRATION } from "../../shared/prediction.types";
import { ScoredNumber } from "./scoringEngine";
import { calculateACValue } from "../mathService";
import { ScoreBreakdown, AlgoKey } from "../../shared/prediction.types";
import { calculateGeneticDiversityIndex } from "./diversityService";

const DOMAIN_SIZE = 90;
const DRAW_SIZE = 5;

export interface CombinationEnergyBreakdown {
  totalEnergy: number;
  baseScoreTerm: number;
  affinityTerm: number;
  repetitionPenalty: number;
  parityPenalty: number;
  decadePenalty: number;
  amplitudePenalty: number;
  consecutivePenalty: number;
  acPenalty: number;
  diversityPenalty: number;
  spatialClusteringPenalty: number;
  recentBiasPenalty: number;
  profileSimilarityPenalty: number;
  dominantFamilyPenalty: number;
  decadeConcentrationPenalty: number;
  outsiderQuotaPenalty: number;
}

/**
 * Identify dominant algorithm for a given number based on score breakdown.
 */
export const getDominantAlgo = (num: number, breakdownsMap: Map<number, ScoreBreakdown>): string | null => {
  const bd = breakdownsMap.get(num);
  if (!bd) return null;
  let maxVal = -Infinity;
  let maxAlgo: string | null = null;
  Object.entries(bd).forEach(([algo, val]) => {
    if (typeof val === "number" && val > maxVal) {
      maxVal = val;
      maxAlgo = algo;
    }
  });
  return maxAlgo;
};

/**
 * Compute cosine similarity between algorithmic profiles of two numbers.
 */
export const getProfileSimilarity = (n1: number, n2: number, breakdownsMap: Map<number, ScoreBreakdown>): number => {
  const bd1 = breakdownsMap.get(n1);
  const bd2 = breakdownsMap.get(n2);
  if (!bd1 || !bd2) return 0;
  
  let dot = 0;
  let norm1 = 0;
  let norm2 = 0;
  const keys = Object.keys(bd1);
  
  keys.forEach(k => {
    const v1 = bd1[k as AlgoKey] || 0;
    const v2 = bd2[k as AlgoKey] || 0;
    dot += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  });
  
  if (norm1 === 0 || norm2 === 0) return 0;
  return dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
};

/**
 * CALCUL DÉTAILLÉ DE L'ÉNERGIE ET DES PÉNALITÉS D'UNE COMBINAISON (PARTIELLE OU FINALE)
 * Harmonise toutes les contraintes de construction dans un paysage d'énergie continu,
 * sans rupture de gradient, avec des pénalités saturées de façon contrôlée.
 */
export const calculateCombinationEnergyDetailed = (
  combo: number[],
  scoresMap: Map<number, number>,
  affinityMap: Float32Array[],
  calibration: EmpiricalCalibration = FALLBACK_CALIBRATION,
  lastDraw?: number[],
  breakdownsMap?: Map<number, ScoreBreakdown>,
  topPool?: number[],
  targetOutsiders: number = 0,
): CombinationEnergyBreakdown => {
  let baseScoreSum = 0.0;
  let affinitySum = 0.0;
  
  for (let i = 0; i < combo.length; i++) {
    const n1 = combo[i];
    baseScoreSum += scoresMap.get(n1) || 0.0;
    for (let j = i + 1; j < combo.length; j++) {
      const n2 = combo[j];
      affinitySum += affinityMap[n1]?.[n2] || 0.0;
    }
  }

  // Normalisation continue pour que l'évaluation reste cohérente même sur les combinaisons partielles (greedy)
  const baseScoreScale = combo.length > 0 ? 5.0 / combo.length : 1.0;
  const affinityScale = combo.length > 1 ? 10.0 / (combo.length * (combo.length - 1)) : 1.0;

  const baseScoreTerm = -(baseScoreSum * baseScoreScale);
  const affinityTerm = -(affinitySum * affinityScale);

  // 1. Anti-Répétition : Loi Hypergéométrique exacte
  let repetitionPenalty = 0.0;
  if (lastDraw && lastDraw.length > 0 && combo.length > 0) {
    const intersectionCount = combo.filter((n) => lastDraw.includes(n)).length;
    const expectedIntersection = (combo.length * DRAW_SIZE) / DOMAIN_SIZE;
    const varIntersection = combo.length * (DRAW_SIZE / DOMAIN_SIZE) * (1.0 - DRAW_SIZE / DOMAIN_SIZE) * ((DOMAIN_SIZE - DRAW_SIZE) / (DOMAIN_SIZE - 1.0));
    const stdIntersection = Math.sqrt(Math.max(Number.EPSILON, varIntersection));
    const zIntersection = Math.max(0.0, intersectionCount - expectedIntersection) / stdIntersection;
    repetitionPenalty = Math.min(25.0, Math.pow(zIntersection, 2.0));
  }

  // 2. Parité : Loi binomiale B(combo.length, 0.5)
  let parityPenalty = 0.0;
  if (combo.length > 0) {
    const evens = combo.filter((n) => n % 2 === 0).length;
    const expectedEvens = combo.length * 0.5;
    const stdEvens = Math.sqrt(combo.length * 0.25);
    const zEvens = (evens - expectedEvens) / stdEvens;
    parityPenalty = Math.min(10.0, Math.pow(zEvens, 2.0));
  }

  // 3. Dizaines (Décades) : Loi Multinomiale
  let decadePenalty = 0.0;
  if (combo.length > 0) {
    const decades = new Array(10).fill(0);
    for (const num of combo) decades[Math.floor(num / 10.0)]++;
    const maxDecade = decades.reduce((a, b) => Math.max(a, b), 0);
    const expectedDecade = combo.length / 10.0;
    const stdDecades = Math.sqrt(combo.length * 0.1 * 0.9);
    const zDecades = Math.max(0.0, maxDecade - expectedDecade) / stdDecades;
    decadePenalty = Math.min(15.0, Math.pow(zDecades, 2.0));
  }

  // 4. Amplitude : Z-score Gaussien Empirique
  let amplitudePenalty = 0.0;
  if (combo.length >= 2) {
    const sortedCombo = [...combo].sort((a, b) => a - b);
    const amplitude = sortedCombo[sortedCombo.length - 1] - sortedCombo[0];
    const ampScale = (combo.length - 1) / 4.0;
    const expectedAmp = calibration.meanAmplitude * ampScale;
    const expectedStd = calibration.stdAmplitude * Math.sqrt(ampScale);
    const zAmp = (amplitude - expectedAmp) / Math.max(Number.EPSILON, expectedStd);
    amplitudePenalty = Math.min(15.0, Math.pow(zAmp, 2.0));
  }

  // 5. Séquences (Consécutives) : Pénalité dérivée de Poisson
  let consecutivePenalty = 0.0;
  if (combo.length >= 2) {
    const sortedCombo = [...combo].sort((a, b) => a - b);
    let maxConsecutive = 1;
    let currentConsecutive = 1;
    for (let i = 0; i < sortedCombo.length - 1; i++) {
      if (sortedCombo[i] + 1 === sortedCombo[i + 1]) {
        currentConsecutive++;
        if (currentConsecutive > maxConsecutive) maxConsecutive = currentConsecutive;
      } else {
        currentConsecutive = 1;
      }
    }
    const lambda = calibration.lambdaConsecutives;
    const expectedConsecutive = 1.0 + lambda * ((combo.length - 1) / 4.0);
    const stdConsecutive = Math.max(0.1, Math.sqrt(lambda));
    const zConsecutive = Math.max(0.0, maxConsecutive - expectedConsecutive) / stdConsecutive;
    consecutivePenalty = Math.pow(zConsecutive, 2.0);
    if (maxConsecutive >= 3) {
      consecutivePenalty += 5.0 * (maxConsecutive - 2);
    }
    consecutivePenalty = Math.min(20.0, consecutivePenalty);
  }

  // 6. AC (Complexité Arithmétique) : Z-score Gaussien Empirique
  let acPenalty = 0.0;
  if (combo.length >= 4) {
    const sortedCombo = [...combo].sort((a, b) => a - b);
    const ac = calculateACValue(sortedCombo);
    const acScale = (combo.length - 3) / 2.0;
    const expectedAC = calibration.meanAC * acScale;
    const stdAC = calibration.stdAC * Math.sqrt(acScale);
    const zAC = (ac - expectedAC) / Math.max(Number.EPSILON, stdAC);
    acPenalty = Math.min(8.0, Math.pow(zAC, 2.0) * Math.exp(-Math.abs(zAC)));
  }

  // 7. Pénalité de Diversité Génétique et Monoculture contrôlée (Saturation progressive)
  let diversityPenalty = 0.0;
  if (breakdownsMap && combo.length >= 2) {
    const smallBreakdowns: Record<number, ScoreBreakdown> = {};
    for (const num of combo) {
      const bd = breakdownsMap.get(num);
      if (bd) smallBreakdowns[num] = bd;
    }
    const diversity = calculateGeneticDiversityIndex(combo, smallBreakdowns);
    const numAlgos = Object.keys(smallBreakdowns[combo[0]] || {}).length;
    const dynamicMonocultureThreshold = 1.0 - 1.0 / Math.sqrt(Math.max(1, numAlgos));
    
    if (diversity.isMonoculture || diversity.meanSimilarity > dynamicMonocultureThreshold) {
      const excessSimilarity = diversity.meanSimilarity - dynamicMonocultureThreshold;
      const maxExcess = 1.0 - dynamicMonocultureThreshold;
      const normalizedExcess = excessSimilarity / Math.max(Number.EPSILON, maxExcess);
      
      const maxPenalty = 25.0;
      const curvature = 4.0;
      // Saturation contrôlée : évite de polluer l'échelle totale d'énergie avec des infinis ou des 1000.0
      const monoculturePenalty = maxPenalty * (Math.exp(curvature * normalizedExcess) - 1.0) / (Math.exp(curvature) - 1.0);
      diversityPenalty = monoculturePenalty;
    } else {
      diversityPenalty = diversity.penalty;
    }
  }

  // 8. Pénalité Spatiale de Proximité fine (densité et clusters locaux)
  // Proximity threshold derived from domain geometry: sqrt(DOMAIN_SIZE/DRAW_SIZE) ≈ 4.24
  // Window derived from expected gap between draws: DOMAIN_SIZE/DRAW_SIZE = 18
  let spatialClusteringPenalty = 0.0;
  if (combo.length >= 2) {
    const sortedCombo = [...combo].sort((a, b) => a - b);
    const proximityThreshold = Math.round(Math.sqrt(DOMAIN_SIZE / DRAW_SIZE)); // ~4
    const windowSize = Math.round(DOMAIN_SIZE / DRAW_SIZE);                    // ~18
    const pairPenaltyUnit = 1.0 / DRAW_SIZE;   // 0.2 per close pair
    const clusterPenaltyUnit = 1.0 / DRAW_SIZE; // 0.2 per extra number in window

    let adjacentClosePairs = 0;
    for (let i = 0; i < sortedCombo.length - 1; i++) {
      const diff = sortedCombo[i + 1] - sortedCombo[i];
      if (diff <= proximityThreshold) adjacentClosePairs++;
    }
    spatialClusteringPenalty += adjacentClosePairs * (pairPenaltyUnit * 12.5);

    for (let i = 0; i < sortedCombo.length; i++) {
      let countInWindow = 1;
      for (let j = i + 1; j < sortedCombo.length; j++) {
        if (sortedCombo[j] - sortedCombo[i] <= windowSize) countInWindow++;
      }
      if (countInWindow >= 3) {
        spatialClusteringPenalty += clusterPenaltyUnit * 15.0 * (countInWindow - 2);
      }
    }
    spatialClusteringPenalty = Math.min(15.0, spatialClusteringPenalty);
  }

  // 9. Pénalité Recent-Bias (Adjacence de voisinage T-1)
  // Unit penalty derived from draw size: 1/DRAW_SIZE ensures scale-invariance
  let recentBiasPenalty = 0.0;
  if (lastDraw && lastDraw.length > 0 && combo.length > 0) {
    let neighborsCount = 0;
    for (const num of combo) {
      for (const prev of lastDraw) {
        if (Math.abs(num - prev) === 1) neighborsCount++;
      }
    }
    const unitPenalty = 7.5 / DRAW_SIZE; // Scale-invariant: 1.5 for DRAW_SIZE=5
    recentBiasPenalty = Math.min(7.5, neighborsCount * unitPenalty);
  }

  // 10. Pénalité de Profil de similarité excessive (Mapping Sigmoïdal Continu)
  let profileSimilarityPenalty = 0.0;
  if (breakdownsMap && combo.length >= 2) {
    for (let i = 0; i < combo.length; i++) {
      for (let j = i + 1; j < combo.length; j++) {
        const sim = getProfileSimilarity(combo[i], combo[j], breakdownsMap);
        // Sigmoïde logistique continue centrée à 0.65 pour un gradient doux et continu
        const simExcessWeight = 1.0 / (1.0 + Math.exp(-12.0 * (sim - 0.65)));
        profileSimilarityPenalty += 6.0 * sim * simExcessWeight;
      }
    }
    profileSimilarityPenalty = Math.min(15.0, profileSimilarityPenalty);
  }

  // 11. Pénalité d'Algorithme dominant répété (Anti-concentration de familles continue)
  let dominantFamilyPenalty = 0.0;
  if (breakdownsMap && combo.length >= 2) {
    const familyCounts: Record<string, number> = {};
    for (const num of combo) {
      const dom = getDominantAlgo(num, breakdownsMap);
      if (dom) {
        familyCounts[dom] = (familyCounts[dom] || 0) + 1;
      }
    }
    for (const count of Object.values(familyCounts)) {
      // Softplus continu pour une transition douce
      const softExcess = Math.log(1.0 + Math.exp(2.0 * (count - 1.5))) / 2.0;
      dominantFamilyPenalty += softExcess * 3.5;
    }
    dominantFamilyPenalty = Math.min(15.0, dominantFamilyPenalty);
  }

  // 12. Pénalité de Concentration par décennie continue
  let decadeConcentrationPenalty = 0.0;
  if (combo.length >= 2) {
    const decCounts: Record<number, number> = {};
    for (const num of combo) {
      const d = Math.floor(num / 10.0);
      decCounts[d] = (decCounts[d] || 0) + 1;
    }
    for (const count of Object.values(decCounts)) {
      const softExcess = Math.log(1.0 + Math.exp(2.0 * (count - 1.5))) / 2.0;
      decadeConcentrationPenalty += softExcess * 2.8;
    }
    decadeConcentrationPenalty = Math.min(12.0, decadeConcentrationPenalty);
  }

  // 13. Pénalité de Quota souple d'outsiders (Loss pseudo-Huber continue)
  let outsiderQuotaPenalty = 0.0;
  if (topPool && topPool.length > 0 && combo.length === DRAW_SIZE) {
    const currentOutsiders = combo.filter(n => !topPool.includes(n)).length;
    const deltaOut = currentOutsiders - targetOutsiders;
    // Pseudo-Huber loss : sqrt(1 + delta^2) - 1
    const huberLoss = Math.sqrt(1.0 + Math.pow(deltaOut, 2.0)) - 1.0;
    outsiderQuotaPenalty = huberLoss * 4.0;
  }

  const totalEnergy = 
    baseScoreTerm + 
    affinityTerm + 
    repetitionPenalty + 
    parityPenalty + 
    decadePenalty + 
    amplitudePenalty + 
    consecutivePenalty + 
    acPenalty + 
    diversityPenalty + 
    spatialClusteringPenalty + 
    recentBiasPenalty + 
    profileSimilarityPenalty + 
    dominantFamilyPenalty + 
    decadeConcentrationPenalty + 
    outsiderQuotaPenalty;

  return {
    totalEnergy,
    baseScoreTerm,
    affinityTerm,
    repetitionPenalty,
    parityPenalty,
    decadePenalty,
    amplitudePenalty,
    consecutivePenalty,
    acPenalty,
    diversityPenalty,
    spatialClusteringPenalty,
    recentBiasPenalty,
    profileSimilarityPenalty,
    dominantFamilyPenalty,
    decadeConcentrationPenalty,
    outsiderQuotaPenalty
  };
};

/**
 * Interface standard de calcul d'énergie (conserve une compatibilité stricte).
 */
export const calculateCombinationEnergy = (
  combo: number[],
  scoresMap: Map<number, number>,
  affinityMap: Float32Array[],
  calibration: EmpiricalCalibration = FALLBACK_CALIBRATION,
  lastDraw?: number[],
  breakdownsMap?: Map<number, ScoreBreakdown>,
  topPool?: number[],
  targetOutsiders: number = 0,
): number => {
  return calculateCombinationEnergyDetailed(
    combo,
    scoresMap,
    affinityMap,
    calibration,
    lastDraw,
    breakdownsMap,
    topPool,
    targetOutsiders
  ).totalEnergy;
};

/**
 * GÉNÉRATION DE COMBINAISON HAUTE DEGAMME PAR RECUIT SIMULÉ (MOTEUR UNIQUE DE VÉRITÉ)
 * Unifie la construction gloutonne sur le gain marginal d'énergie et execute
 * un recuit simulé déterministe avec reheat et opérateurs de mutations spécialisées.
 */
export const generateCombination = async (
  sortedScores: ScoredNumber[],
  affinityMap: Float32Array[],
  calibration: EmpiricalCalibration,
  outsiderCount: number,
  lastDraw: number[] | undefined,
  regimeStateNormalized: number,
): Promise<number[]> => {
  const outsiderRatio = outsiderCount / DRAW_SIZE;
  const scoresMap = new Map<number, number>();
  const breakdownsMap = new Map<number, ScoreBreakdown>();
  
  sortedScores.forEach((s) => {
    scoresMap.set(s.num, s.score);
    if (s.breakdown) breakdownsMap.set(s.num, s.breakdown);
  });

  const topZoneCount = Math.max(DRAW_SIZE, Math.floor(sortedScores.length * Math.max(0.0, 1.0 - outsiderRatio)));
  const topPool = sortedScores.slice(0, topZoneCount).map((s) => s.num);
  const outsiderPool = sortedScores.slice(topZoneCount, sortedScores.length).map((s) => s.num);
  const allCandidatesPool = sortedScores.map((s) => s.num);

  const targetOutsiders = Math.round(DRAW_SIZE * outsiderRatio);
  const targetTop = Math.max(0, DRAW_SIZE - targetOutsiders);

  // Seed purement déterministe via hachage FNV-1a pour ZÉRO HASARD
  let lcgSeed = 2166136261;
  const mixSeed = (val: number) => {
    lcgSeed ^= val;
    lcgSeed = Math.imul(lcgSeed, 16777619);
  };
  if (lastDraw) lastDraw.forEach(mixSeed);
  sortedScores.slice(0, 10).forEach(s => {
    mixSeed(s.num);
    mixSeed(Math.floor(s.score * 1000));
  });

  const lcgRandom = () => {
    lcgSeed = (lcgSeed * 1664525 + 1013904223) >>> 0;
    return lcgSeed / 4294967296.0;
  };

  // --- ÉTAPE 1 : CONSTRUIRE UN SÉLECTEUR GLOUTON BASÉ SUR LE GAIN MARGINAL D'ÉNERGIE ---
  const runGreedyConstruction = async (
    initialSelections: number[],
    poolCandidates: number[],
    targetOutsidersQuota: number,
    forceOutsiders: boolean = false
  ): Promise<number[]> => {
    const combo = [...initialSelections];
    
    while (combo.length < DRAW_SIZE) {
      let bestCandidate = -1;
      let bestEnergyValue = Infinity;

      let candidates = poolCandidates.filter(c => !combo.includes(c));
      
      if (forceOutsiders) {
        const currentOutsidersCount = combo.filter(n => outsiderPool.includes(n)).length;
        const remainingSlots = DRAW_SIZE - combo.length;
        const neededOutsiders = targetOutsidersQuota - currentOutsidersCount;
        if (neededOutsiders > 0 && neededOutsiders >= remainingSlots) {
          candidates = candidates.filter(c => outsiderPool.includes(c));
          if (candidates.length === 0) {
            candidates = poolCandidates.filter(c => !combo.includes(c) && outsiderPool.includes(c));
          }
        }
      }

      if (candidates.length === 0) {
        candidates = allCandidatesPool.filter(c => !combo.includes(c));
      }

      // Optimisation: Restreindre aux meilleurs candidats pertinents pour éviter O(N^2) complet
      const searchPool = candidates.slice(0, Math.min(30, candidates.length));

      for (const candidate of searchPool) {
        const proposed = [...combo, candidate];
        const energyVal = calculateCombinationEnergy(
          proposed,
          scoresMap,
          affinityMap,
          calibration,
          lastDraw,
          breakdownsMap,
          topPool,
          targetOutsidersQuota
        );
        
        if (energyVal < bestEnergyValue) {
          bestEnergyValue = energyVal;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate !== -1) {
        combo.push(bestCandidate);
      } else {
        // Fallback de secours
        for (const cand of candidates) {
          if (!combo.includes(cand)) {
            combo.push(cand);
            break;
          }
        }
        if (combo.length === initialSelections.length) break;
      }
    }

    return combo;
  };

  // --- ÉTAPE 2 : MULTIPLES SEEDS GLOUTONNES DE DÉPART DÉTERMINISTES ---
  // Seed 1 : Orientée score pur (recherche gloutonne standard)
  const seed1 = await runGreedyConstruction([topPool[0]], allCandidatesPool, targetOutsiders);

  // Seed 2 : Orientée orthogonalité / diversité de profil
  const firstNum = topPool[0];
  const secondNumCandidates = topPool.slice(1, 15).filter(n => getProfileSimilarity(firstNum, n, breakdownsMap) < 0.4);
  const secondNum = secondNumCandidates.length > 0 ? secondNumCandidates[0] : topPool[1];
  const seed2 = await runGreedyConstruction([firstNum, secondNum], allCandidatesPool, targetOutsiders);

  // Seed 3 : Orientée affinité maximale de départ
  let bestPair = [topPool[0], topPool[1]];
  let maxAffinity = -1;
  for (let i = 0; i < Math.min(10, topPool.length); i++) {
    for (let j = i + 1; j < Math.min(10, topPool.length); j++) {
      const aff = affinityMap[topPool[i]]?.[topPool[j]] || 0;
      if (aff > maxAffinity) {
        maxAffinity = aff;
        bestPair = [topPool[i], topPool[j]];
      }
    }
  }
  const seed3 = await runGreedyConstruction(bestPair, allCandidatesPool, targetOutsiders);

  // Seed 4 : Orientée outsiders forcés d'entrée
  const firstOutsider = outsiderPool.length > 0 ? outsiderPool[0] : topPool[topPool.length - 1];
  const seed4 = await runGreedyConstruction([firstOutsider], allCandidatesPool, targetOutsiders, true);

  // Yield au navigateur avant le recuit simulé
  await new Promise(resolve => setTimeout(resolve, 0));

  // Élection de la meilleure seed gloutonne selon l'énergie globale
  const seedsList = [seed1, seed2, seed3, seed4].filter(s => s.length === DRAW_SIZE);
  let bestInitialCombo = seed1;
  let bestInitialEnergy = Infinity;

  for (const s of seedsList) {
    const e = calculateCombinationEnergy(s, scoresMap, affinityMap, calibration, lastDraw, breakdownsMap, topPool, targetOutsiders);
    if (e < bestInitialEnergy) {
      bestInitialEnergy = e;
      bestInitialCombo = s;
    }
  }

  let currentCombo = [...bestInitialCombo];
  let currentEnergy = bestInitialEnergy;
  let bestCombo = [...currentCombo];
  let bestEnergy = currentEnergy;

  // --- ÉTAPE 3 : CALIBRATION DYNAMIQUE DE LA TEMPÉRATURE SUR L'AGITATION LOCALE ---
  let sumDelta = 0;
  let samplesCount = 0;
  for (let s = 0; s < 10; s++) {
    const idx = Math.floor(lcgRandom() * DRAW_SIZE);
    const isOutsiderSlot = idx >= targetTop;
    const list = isOutsiderSlot && outsiderPool.length > 0 ? outsiderPool : topPool;
    const rNum = list[Math.floor(lcgRandom() * list.length)];
    if (!currentCombo.includes(rNum)) {
      const propose = [...currentCombo];
      propose[idx] = rNum;
      const proposeEnergy = calculateCombinationEnergy(propose, scoresMap, affinityMap, calibration, lastDraw, breakdownsMap, topPool, targetOutsiders);
      sumDelta += Math.abs(proposeEnergy - currentEnergy);
      samplesCount++;
    }
  }

  const meanDelta = samplesCount > 0 ? sumDelta / samplesCount : 2.5;
  let temperature = Math.max(1.0, meanDelta) * Math.exp(regimeStateNormalized);
  const initialTemperature = temperature;
  const minTemperature = initialTemperature * 1e-4;
  
  const stateSpaceSize = DRAW_SIZE * (DOMAIN_SIZE - DRAW_SIZE);
  const iterationsPerTemp = Math.max(8, Math.floor(Math.log(stateSpaceSize) * 3.5 * Math.exp(regimeStateNormalized)));

  let stagnationCounter = 0;

  // CORRECTIF PERFORMANCE : mesuré empiriquement sur données réelles (Baraka, 240 tirages),
  // le plafond précédent (2x le pire cas théorique sans réchauffe, ~1833 itérations) était
  // SYSTÉMATIQUEMENT atteint intégralement — la boucle ne convergeait jamais naturellement
  // avant la limite, causant ~20 secondes par prédiction. Deux causes combinées :
  // 1) le mécanisme de réchauffe peut se déclencher très souvent en cas de stagnation
  //    fréquente près d'un optimum local, entretenant une tension avec le refroidissement ;
  // 2) le plafond de 2x était lui-même trop généreux pour un usage interactif.
  // On plafonne maintenant les DEUX leviers : le nombre total d'itérations externes (budget
  // resserré, toujours dérivé du pire cas théorique mais avec une marge réduite) ET le nombre
  // de réchauffes autorisées (au-delà, le refroidissement continue sans plus être contré).
  // bestCombo (déjà suivi tout au long de la recherche) garantit qu'on ne perd jamais la
  // meilleure solution trouvée, quel que soit le point d'arrêt.
  const worstCaseCoolingSteps = Math.log(1e-4) / Math.log(0.99);
  const maxOuterIterations = Math.ceil(worstCaseCoolingSteps * 0.4);
  const maxReheatEvents = Math.max(3, Math.ceil(Math.log2(stateSpaceSize)));
  let reheatEventCount = 0;
  let outerIterationCount = 0;

  // --- ÉTAPE 4 : RECUIT SIMULÉ ULTRA ROBUSTE ---
  while (temperature > minTemperature && outerIterationCount < maxOuterIterations) {
    outerIterationCount++;

    // CORRECTIF RÉACTIVITÉ : céder le contrôle au navigateur toutes les 15 itérations
    // externes. Sans ce point de cession, même une recherche rapide en soi (quelques
    // secondes) s'exécute comme un unique bloc synchrone ininterrompu, gelant l'interface
    // (aucun rendu, aucune interaction possible) pendant toute sa durée. La fréquence (15)
    // équilibre réactivité perçue et surcoût de planification : assez fréquent pour rester
    // fluide, assez espacé pour ne pas dominer le temps de calcul utile.
    if (outerIterationCount % 15 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const energyVariances: number[] = [];
    
    for (let i = 0; i < iterationsPerTemp; i++) {
      let proposedCombo = [...currentCombo];
      const moveType = lcgRandom();

      // Opérateurs de mutations enrichis
      if (moveType < 0.8) {
        // A. Single swap classique (80%)
        const indexToSwap = Math.floor(lcgRandom() * DRAW_SIZE);
        const isOutsiderSlot = indexToSwap >= targetTop;
        const candidateList = isOutsiderSlot && outsiderPool.length > 0 ? outsiderPool : topPool;
        
        let newNum = candidateList[Math.floor(lcgRandom() * candidateList.length)];
        let attempts = 0;
        while (currentCombo.includes(newNum) && attempts < candidateList.length) {
          newNum = candidateList[Math.floor(lcgRandom() * candidateList.length)];
          attempts++;
        }
        proposedCombo[indexToSwap] = newNum;
      } 
      else if (moveType < 0.9) {
        // B. Double swap lourd (10%)
        const idx1 = Math.floor(lcgRandom() * DRAW_SIZE);
        let idx2 = Math.floor(lcgRandom() * DRAW_SIZE);
        while (idx2 === idx1) {
          idx2 = Math.floor(lcgRandom() * DRAW_SIZE);
        }

        const isOutsider1 = idx1 >= targetTop;
        const list1 = isOutsider1 && outsiderPool.length > 0 ? outsiderPool : topPool;
        let newNum1 = list1[Math.floor(lcgRandom() * list1.length)];
        let attempts = 0;
        while (proposedCombo.includes(newNum1) && attempts < list1.length) {
          newNum1 = list1[Math.floor(lcgRandom() * list1.length)];
          attempts++;
        }
        proposedCombo[idx1] = newNum1;

        const isOutsider2 = idx2 >= targetTop;
        const list2 = isOutsider2 && outsiderPool.length > 0 ? outsiderPool : topPool;
        let newNum2 = list2[Math.floor(lcgRandom() * list2.length)];
        attempts = 0;
        while (proposedCombo.includes(newNum2) && attempts < list2.length) {
          newNum2 = list2[Math.floor(lcgRandom() * list2.length)];
          attempts++;
        }
        proposedCombo[idx2] = newNum2;
      } 
      else {
        // C. Mutation ciblée par affinité (10%)
        // Éjecter le numéro qui a le moins d'affinité avec le reste
        let minAvgAff = Infinity;
        let minAffIdx = 0;
        for (let idx = 0; idx < DRAW_SIZE; idx++) {
          let sumAff = 0;
          for (let k = 0; k < DRAW_SIZE; k++) {
            if (idx !== k) {
              sumAff += affinityMap[currentCombo[idx]]?.[currentCombo[k]] || 0;
            }
          }
          if (sumAff < minAvgAff) {
            minAvgAff = sumAff;
            minAffIdx = idx;
          }
        }

        const isOutsiderSlot = minAffIdx >= targetTop;
        const candidateList = isOutsiderSlot && outsiderPool.length > 0 ? outsiderPool : topPool;
        const otherNumbers = currentCombo.filter((_, idx) => idx !== minAffIdx);

        let bestCand = -1;
        let maxCandAff = -Infinity;
        for (let a = 0; a < 8; a++) {
          const cand = candidateList[Math.floor(lcgRandom() * candidateList.length)];
          if (currentCombo.includes(cand)) continue;
          let sumAff = 0;
          for (const o of otherNumbers) {
            sumAff += affinityMap[cand]?.[o] || 0;
          }
          if (sumAff > maxCandAff) {
            maxCandAff = sumAff;
            bestCand = cand;
          }
        }

        if (bestCand !== -1) {
          proposedCombo[minAffIdx] = bestCand;
        } else {
          // Fallback single swap
          const list = isOutsiderSlot && outsiderPool.length > 0 ? outsiderPool : topPool;
          let newNum = list[Math.floor(lcgRandom() * list.length)];
          let attempts = 0;
          while (currentCombo.includes(newNum) && attempts < list.length) {
            newNum = list[Math.floor(lcgRandom() * list.length)];
            attempts++;
          }
          proposedCombo[minAffIdx] = newNum;
        }
      }

      const proposedEnergy = calculateCombinationEnergy(
        proposedCombo,
        scoresMap,
        affinityMap,
        calibration,
        lastDraw,
        breakdownsMap,
        topPool,
        targetOutsiders
      );
      
      energyVariances.push(Math.abs(proposedEnergy - currentEnergy));

      if (proposedEnergy < currentEnergy) {
        currentCombo = proposedCombo;
        currentEnergy = proposedEnergy;
        stagnationCounter = 0; // Reset stagnation on any improvement
        if (proposedEnergy < bestEnergy) {
          bestCombo = [...currentCombo];
          bestEnergy = proposedEnergy;
        }
      } else {
        const acceptanceProbability = Math.exp(-(proposedEnergy - currentEnergy) / temperature);
        if (lcgRandom() < acceptanceProbability) {
          currentCombo = proposedCombo;
          currentEnergy = proposedEnergy;
        } else {
          stagnationCounter++;
        }
      }
    }

    // --- REHEAT (Anti-Minima Locaux), plafonné à maxReheatEvents ---
    if (stagnationCounter >= 30 && reheatEventCount < maxReheatEvents) {
      temperature = Math.min(initialTemperature * 1.5, temperature * 1.15);
      stagnationCounter = 0;
      reheatEventCount++;
    }

    const avgVariance = energyVariances.length > 0 
      ? energyVariances.reduce((a, b) => a + b, 0.0) / energyVariances.length 
      : 0.0;

    // Taux de refroidissement adaptatif basé sur l'agitation relative
    const relativeAgitation = avgVariance / Math.max(Number.EPSILON, temperature);
    const coolingSignal = 1.0 / (1.0 + Math.exp(-relativeAgitation)); 
    const adaptiveCoolingRate = 0.85 + (0.14 * coolingSignal);
    
    temperature *= adaptiveCoolingRate;
  }

  return bestCombo.sort((a, b) => a - b);
};
