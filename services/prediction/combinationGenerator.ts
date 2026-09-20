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

export interface PrecomputedEnergyContext {
  lastDrawHas: Uint8Array;
  lastDrawNeighbors: Uint8Array;
  topPoolHas: Uint8Array;
  outsiderPoolHas: Uint8Array;
  profileSimMatrix: Float32Array;
  dominantAlgoMap: (string | null)[];
  numAlgos: number;
}

export const buildPrecomputedEnergyContext = (
  breakdownsMap: Map<number, ScoreBreakdown> | undefined,
  lastDraw: number[] | undefined,
  topPool: number[] | undefined,
  outsiderPool?: number[]
): PrecomputedEnergyContext => {
  const lastDrawHas = new Uint8Array(91);
  const lastDrawNeighbors = new Uint8Array(91);
  if (lastDraw && lastDraw.length > 0) {
    for (let i = 0; i < lastDraw.length; i++) {
      const num = lastDraw[i];
      if (num >= 1 && num <= 90) {
        lastDrawHas[num] = 1;
        if (num > 1) lastDrawNeighbors[num - 1] = 1;
        if (num < 90) lastDrawNeighbors[num + 1] = 1;
      }
    }
  }

  const topPoolHas = new Uint8Array(91);
  if (topPool && topPool.length > 0) {
    for (let i = 0; i < topPool.length; i++) {
      const num = topPool[i];
      if (num >= 1 && num <= 90) topPoolHas[num] = 1;
    }
  }

  const outsiderPoolHas = new Uint8Array(91);
  if (outsiderPool && outsiderPool.length > 0) {
    for (let i = 0; i < outsiderPool.length; i++) {
      const num = outsiderPool[i];
      if (num >= 1 && num <= 90) outsiderPoolHas[num] = 1;
    }
  }

  const profileSimMatrix = new Float32Array(91 * 91);
  const dominantAlgoMap: (string | null)[] = new Array(91).fill(null);
  let numAlgos = 0;

  if (breakdownsMap && breakdownsMap.size > 0) {
    let algoKeys: string[] = [];
    for (const bd of breakdownsMap.values()) {
      if (bd) {
        algoKeys = Object.keys(bd).filter(k => typeof (bd as any)[k] === 'number');
        if (algoKeys.length > 0) break;
      }
    }
    numAlgos = algoKeys.length;

    const normVectors: (Float32Array | null)[] = new Array(91).fill(null);
    for (let num = 1; num <= 90; num++) {
      const bd = breakdownsMap.get(num);
      if (!bd) continue;

      let maxVal = -Infinity;
      let dominant: string | null = null;
      const vec = new Float32Array(algoKeys.length);
      let sumSq = 0;

      for (let k = 0; k < algoKeys.length; k++) {
        const val = Math.max(0, Number((bd as any)[algoKeys[k]]) || 0);
        vec[k] = val;
        sumSq += val * val;
        if (val > maxVal) {
          maxVal = val;
          dominant = algoKeys[k];
        }
      }
      dominantAlgoMap[num] = dominant;

      const norm = Math.sqrt(sumSq);
      if (norm > 1e-12) {
        for (let k = 0; k < algoKeys.length; k++) {
          vec[k] /= norm;
        }
        normVectors[num] = vec;
      }
    }

    for (let n1 = 1; n1 <= 90; n1++) {
      const v1 = normVectors[n1];
      if (!v1) continue;
      profileSimMatrix[n1 * 91 + n1] = 1.0;
      for (let n2 = n1 + 1; n2 <= 90; n2++) {
        const v2 = normVectors[n2];
        if (!v2) continue;
        let dot = 0;
        for (let k = 0; k < algoKeys.length; k++) {
          dot += v1[k] * v2[k];
        }
        const sim = Math.max(-1.0, Math.min(1.0, dot));
        profileSimMatrix[n1 * 91 + n2] = sim;
        profileSimMatrix[n2 * 91 + n1] = sim;
      }
    }
  }

  return {
    lastDrawHas,
    lastDrawNeighbors,
    topPoolHas,
    outsiderPoolHas,
    profileSimMatrix,
    dominantAlgoMap,
    numAlgos,
  };
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
  precomputed?: PrecomputedEnergyContext,
): CombinationEnergyBreakdown => {
  const len = combo.length;
  let baseScoreSum = 0.0;
  let affinitySum = 0.0;
  
  for (let i = 0; i < len; i++) {
    const n1 = combo[i];
    baseScoreSum += scoresMap.get(n1) || 0.0;
    for (let j = i + 1; j < len; j++) {
      const n2 = combo[j];
      affinitySum += affinityMap[n1]?.[n2] || 0.0;
    }
  }

  // Normalisation continue pour que l'évaluation reste cohérente même sur les combinaisons partielles (greedy)
  const baseScoreScale = len > 0 ? 5.0 / len : 1.0;
  const affinityScale = len > 1 ? 10.0 / (len * (len - 1)) : 1.0;

  const baseScoreTerm = -(baseScoreSum * baseScoreScale);
  const affinityTerm = -(affinitySum * affinityScale);

  // Tri unique réutilisé pour toutes les métriques ordonnées
  let sortedCombo: number[] | null = null;
  if (len >= 2) {
    sortedCombo = [...combo].sort((a, b) => a - b);
  }

  // 1. Anti-Répétition : Loi Hypergéométrique exacte
  let repetitionPenalty = 0.0;
  if (lastDraw && lastDraw.length > 0 && len > 0) {
    let intersectionCount = 0;
    if (precomputed?.lastDrawHas) {
      for (let i = 0; i < len; i++) {
        if (precomputed.lastDrawHas[combo[i]]) intersectionCount++;
      }
    } else {
      intersectionCount = combo.filter((n) => lastDraw.includes(n)).length;
    }
    const expectedIntersection = (len * DRAW_SIZE) / DOMAIN_SIZE;
    const varIntersection = len * (DRAW_SIZE / DOMAIN_SIZE) * (1.0 - DRAW_SIZE / DOMAIN_SIZE) * ((DOMAIN_SIZE - DRAW_SIZE) / (DOMAIN_SIZE - 1.0));
    const stdIntersection = Math.sqrt(Math.max(Number.EPSILON, varIntersection));
    const zIntersection = Math.max(0.0, intersectionCount - expectedIntersection) / stdIntersection;
    repetitionPenalty = Math.min(25.0, Math.pow(zIntersection, 2.0));
  }

  // 2. Parité : Loi binomiale B(len, 0.5)
  let parityPenalty = 0.0;
  if (len > 0) {
    let evens = 0;
    for (let i = 0; i < len; i++) {
      if ((combo[i] & 1) === 0) evens++;
    }
    const expectedEvens = len * 0.5;
    const stdEvens = Math.sqrt(len * 0.25);
    const zEvens = (evens - expectedEvens) / stdEvens;
    parityPenalty = Math.min(10.0, Math.pow(zEvens, 2.0));
  }

  // 3. Dizaines (Décades) : Loi Multinomiale
  let decadePenalty = 0.0;
  if (len > 0) {
    let d0=0, d1=0, d2=0, d3=0, d4=0, d5=0, d6=0, d7=0, d8=0, d9=0;
    for (let i = 0; i < len; i++) {
      const d = Math.floor(combo[i] / 10.0);
      switch(d) {
        case 0: d0++; break;
        case 1: d1++; break;
        case 2: d2++; break;
        case 3: d3++; break;
        case 4: d4++; break;
        case 5: d5++; break;
        case 6: d6++; break;
        case 7: d7++; break;
        case 8: d8++; break;
        default: d9++; break;
      }
    }
    const maxDecade = Math.max(d0, d1, d2, d3, d4, d5, d6, d7, d8, d9);
    const expectedDecade = len / 10.0;
    const stdDecades = Math.sqrt(len * 0.1 * 0.9);
    const zDecades = Math.max(0.0, maxDecade - expectedDecade) / stdDecades;
    decadePenalty = Math.min(15.0, Math.pow(zDecades, 2.0));
  }

  // 4. Amplitude : Z-score Gaussien Empirique
  let amplitudePenalty = 0.0;
  if (sortedCombo && len >= 2) {
    const amplitude = sortedCombo[len - 1] - sortedCombo[0];
    const ampScale = (len - 1) / 4.0;
    const expectedAmp = calibration.meanAmplitude * ampScale;
    const expectedStd = calibration.stdAmplitude * Math.sqrt(ampScale);
    const zAmp = (amplitude - expectedAmp) / Math.max(Number.EPSILON, expectedStd);
    amplitudePenalty = Math.min(15.0, Math.pow(zAmp, 2.0));
  }

  // 5. Séquences (Consécutives) : Pénalité dérivée de Poisson
  let consecutivePenalty = 0.0;
  if (sortedCombo && len >= 2) {
    let maxConsecutive = 1;
    let currentConsecutive = 1;
    for (let i = 0; i < len - 1; i++) {
      if (sortedCombo[i] + 1 === sortedCombo[i + 1]) {
        currentConsecutive++;
        if (currentConsecutive > maxConsecutive) maxConsecutive = currentConsecutive;
      } else {
        currentConsecutive = 1;
      }
    }
    const lambda = calibration.lambdaConsecutives;
    const expectedConsecutive = 1.0 + lambda * ((len - 1) / 4.0);
    const stdConsecutive = Math.max(0.1, Math.sqrt(lambda));
    const zConsecutive = Math.max(0.0, maxConsecutive - expectedConsecutive) / stdConsecutive;
    // Escalade CONTINUE des longues séquences : l'excès au-delà de l'attente empirique est
    // pondéré par le z-score lui-même (dérivé des données), reproduisant l'ancienne pente forte
    // sans le palier binaire `if (maxConsecutive >= 3)` ni ses constantes 5.0/3/2 (AGENTS.md #1 & #3).
    const consecutiveExcess = Math.max(0.0, maxConsecutive - expectedConsecutive);
    consecutivePenalty = Math.pow(zConsecutive, 2.0) + consecutiveExcess * zConsecutive;
    consecutivePenalty = Math.min(20.0, consecutivePenalty);
  }

  // 6. AC (Complexité Arithmétique) : Z-score Gaussien Empirique
  let acPenalty = 0.0;
  if (sortedCombo && len >= 4) {
    const ac = calculateACValue(sortedCombo);
    const acScale = (len - 3) / 2.0;
    const expectedAC = calibration.meanAC * acScale;
    const stdAC = calibration.stdAC * Math.sqrt(acScale);
    const zAC = (ac - expectedAC) / Math.max(Number.EPSILON, stdAC);
    acPenalty = Math.min(8.0, Math.pow(zAC, 2.0) * Math.exp(-Math.abs(zAC)));
  }

  // 7. Pénalité de Diversité Génétique et Monoculture contrôlée (Saturation progressive)
  let diversityPenalty = 0.0;
  if (breakdownsMap && len >= 2) {
    if (precomputed?.profileSimMatrix) {
      let sumSim = 0;
      let pairCount = 0;
      for (let i = 0; i < len; i++) {
        const n1 = combo[i];
        for (let j = i + 1; j < len; j++) {
          sumSim += precomputed.profileSimMatrix[n1 * 91 + combo[j]];
          pairCount++;
        }
      }
      const meanSim = pairCount > 0 ? sumSim / pairCount : 0;
      const numAlgos = precomputed.numAlgos || 26;
      const dynamicMonocultureThreshold = 1.0 - 1.0 / Math.sqrt(Math.max(1, numAlgos));
      
      if (meanSim > dynamicMonocultureThreshold) {
        const excessSimilarity = meanSim - dynamicMonocultureThreshold;
        const maxExcess = 1.0 - dynamicMonocultureThreshold;
        const normalizedExcess = excessSimilarity / Math.max(Number.EPSILON, maxExcess);
        const maxPenalty = 25.0;
        const curvature = 4.0;
        diversityPenalty = maxPenalty * (Math.exp(curvature * normalizedExcess) - 1.0) / (Math.exp(curvature) - 1.0);
      } else {
        diversityPenalty = 0.0;
      }
    } else {
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
        const monoculturePenalty = maxPenalty * (Math.exp(curvature * normalizedExcess) - 1.0) / (Math.exp(curvature) - 1.0);
        diversityPenalty = monoculturePenalty;
      } else {
        diversityPenalty = diversity.penalty;
      }
    }
  }

  // 8. Pénalité Spatiale de Proximité fine (densité et clusters locaux)
  let spatialClusteringPenalty = 0.0;
  if (sortedCombo && len >= 2) {
    const proximityThreshold = Math.round(Math.sqrt(DOMAIN_SIZE / DRAW_SIZE)); // ~4
    const windowSize = Math.round(DOMAIN_SIZE / DRAW_SIZE);                    // ~18
    const pairPenaltyUnit = 1.0 / DRAW_SIZE;   // 0.2 per close pair
    const clusterPenaltyUnit = 1.0 / DRAW_SIZE; // 0.2 per extra number in window

    let adjacentClosePairs = 0;
    for (let i = 0; i < len - 1; i++) {
      const diff = sortedCombo[i + 1] - sortedCombo[i];
      if (diff <= proximityThreshold) adjacentClosePairs++;
    }
    spatialClusteringPenalty += adjacentClosePairs * (pairPenaltyUnit * 12.5);

    for (let i = 0; i < len; i++) {
      let countInWindow = 1;
      for (let j = i + 1; j < len; j++) {
        if (sortedCombo[j] - sortedCombo[i] <= windowSize) countInWindow++;
      }
      // Amas CONTINU : l'excès au-delà de 2 numéros par fenêtre est pénalisé linéairement via
      // Math.max(0, …) au lieu du palier binaire `if (countInWindow >= 3)` (AGENTS.md règle #3).
      // Strictement identique pour des comptes entiers, mais sans seuil d'activation discret.
      const clusterExcess = Math.max(0, countInWindow - 2);
      spatialClusteringPenalty += clusterPenaltyUnit * 15.0 * clusterExcess;
    }
    spatialClusteringPenalty = Math.min(15.0, spatialClusteringPenalty);
  }

  // 9. Pénalité Recent-Bias (Adjacence de voisinage T-1)
  let recentBiasPenalty = 0.0;
  if (lastDraw && lastDraw.length > 0 && len > 0) {
    let neighborsCount = 0;
    if (precomputed?.lastDrawNeighbors) {
      for (let i = 0; i < len; i++) {
        if (precomputed.lastDrawNeighbors[combo[i]]) neighborsCount++;
      }
    } else {
      for (let i = 0; i < len; i++) {
        const num = combo[i];
        for (let j = 0; j < lastDraw.length; j++) {
          if (Math.abs(num - lastDraw[j]) === 1) neighborsCount++;
        }
      }
    }
    const unitPenalty = 7.5 / DRAW_SIZE; // Scale-invariant: 1.5 for DRAW_SIZE=5
    recentBiasPenalty = Math.min(7.5, neighborsCount * unitPenalty);
  }

  // 10. Pénalité de Profil de similarité excessive (Mapping Sigmoïdal Continu)
  let profileSimilarityPenalty = 0.0;
  if (breakdownsMap && len >= 2) {
    for (let i = 0; i < len; i++) {
      const n1 = combo[i];
      for (let j = i + 1; j < len; j++) {
        const n2 = combo[j];
        const sim = precomputed?.profileSimMatrix
          ? precomputed.profileSimMatrix[n1 * 91 + n2]
          : getProfileSimilarity(n1, n2, breakdownsMap);
        // Sigmoïde logistique continue centrée à 0.65 pour un gradient doux et continu
        const simExcessWeight = 1.0 / (1.0 + Math.exp(-12.0 * (sim - 0.65)));
        profileSimilarityPenalty += 6.0 * sim * simExcessWeight;
      }
    }
    profileSimilarityPenalty = Math.min(15.0, profileSimilarityPenalty);
  }

  // 11. Pénalité d'Algorithme dominant répété (Anti-concentration de familles continue)
  let dominantFamilyPenalty = 0.0;
  if (breakdownsMap && len >= 2) {
    const familyCounts: Record<string, number> = {};
    for (let i = 0; i < len; i++) {
      const num = combo[i];
      const dom = precomputed?.dominantAlgoMap
        ? precomputed.dominantAlgoMap[num]
        : getDominantAlgo(num, breakdownsMap);
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
  if (len >= 2) {
    const decCounts: Record<number, number> = {};
    for (let i = 0; i < len; i++) {
      const d = Math.floor(combo[i] / 10.0);
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
  if (topPool && topPool.length > 0 && len === DRAW_SIZE) {
    let currentOutsiders = 0;
    if (precomputed?.topPoolHas) {
      for (let i = 0; i < len; i++) {
        if (!precomputed.topPoolHas[combo[i]]) currentOutsiders++;
      }
    } else {
      currentOutsiders = combo.filter(n => !topPool.includes(n)).length;
    }
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
  precomputed?: PrecomputedEnergyContext,
): number => {
  return calculateCombinationEnergyDetailed(
    combo,
    scoresMap,
    affinityMap,
    calibration,
    lastDraw,
    breakdownsMap,
    topPool,
    targetOutsiders,
    precomputed
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
  hurst: number = 0.5
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

  const precomputedContext = buildPrecomputedEnergyContext(breakdownsMap, lastDraw, topPool, outsiderPool);

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
          targetOutsidersQuota,
          precomputedContext
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
    const e = calculateCombinationEnergy(s, scoresMap, affinityMap, calibration, lastDraw, breakdownsMap, topPool, targetOutsiders, precomputedContext);
    if (e < bestInitialEnergy) {
      bestInitialEnergy = e;
      bestInitialCombo = s;
    }
  }

  let currentCombo = [...bestInitialCombo];
  let currentEnergy = bestInitialEnergy;
  let bestCombo = [...currentCombo];
  let bestEnergy = currentEnergy;

  // --- ÉTAPE 3 : DÉTECTION CONTINUE DU RÉGIME DE VARIANCE ET RATIO SIGNAL/BRUIT (SNR) ---
  // Partition continue du signal (top candidats) vs bruit de fond (background)
  const topCutoff = Math.min(15, Math.max(5, Math.floor(sortedScores.length * 0.2)));
  const topScoresList = sortedScores.slice(0, topCutoff).map(s => s.score);
  const bgScoresList = sortedScores.slice(topCutoff).map(s => s.score);

  const meanTop = topScoresList.reduce((a, b) => a + b, 0) / Math.max(1, topScoresList.length);
  const meanBg = bgScoresList.reduce((a, b) => a + b, 0) / Math.max(1, bgScoresList.length);
  const varTop = topScoresList.reduce((a, b) => a + Math.pow(b - meanTop, 2), 0) / Math.max(1, topScoresList.length);
  const varBg = bgScoresList.reduce((a, b) => a + Math.pow(b - meanBg, 2), 0) / Math.max(1, bgScoresList.length);

  const signalContrast = Math.max(0, meanTop - meanBg);
  // Ratio Signal / Bruit (SNR) continu
  const snr = (Math.pow(signalContrast, 2) + varTop) / (varBg + 1e-4);

  // Équilibre continu Exploration (0.0) vs Exploitation (1.0)
  // Mapping logistique continu centré sur log(SNR)
  const hurstMod = Math.max(0.2, Math.min(0.8, hurst));
  const logSnrNorm = Math.log(Math.max(1e-4, snr));
  const rawExploitationBeta = 1.0 / (1.0 + Math.exp(-2.5 * (logSnrNorm - 0.4)));
  const exploitationBeta = Math.max(0.05, Math.min(0.95, rawExploitationBeta * (0.6 + 0.8 * hurstMod)));
  const explorationBeta = 1.0 - exploitationBeta;

  // Calibration dynamique de la température basée sur l'agitation locale et le régime de variance
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
      const proposeEnergy = calculateCombinationEnergy(propose, scoresMap, affinityMap, calibration, lastDraw, breakdownsMap, topPool, targetOutsiders, precomputedContext);
      sumDelta += Math.abs(proposeEnergy - currentEnergy);
      samplesCount++;
    }
  }

  const meanDelta = samplesCount > 0 ? sumDelta / samplesCount : 2.5;
  // En régime d'exploration (faible SNR), la température initiale s'élève pour favoriser la recherche globale
  // En régime d'exploitation (fort SNR), la température se concentre pour le raffinement fin
  const tempScale = 1.2 - 0.4 * exploitationBeta;
  let temperature = Math.max(1.0, meanDelta * tempScale) * Math.exp(regimeStateNormalized);
  const initialTemperature = temperature;
  const minTemperature = initialTemperature * 1e-4;
  
  const stateSpaceSize = DRAW_SIZE * (DOMAIN_SIZE - DRAW_SIZE);
  // Itérations par température ajustées continûment selon l'équilibre exploration/exploitation
  const itersScaling = (3.0 * explorationBeta + 2.0 * exploitationBeta);
  const iterationsPerTemp = Math.max(8, Math.floor(Math.log(stateSpaceSize) * itersScaling * Math.exp(regimeStateNormalized)));

  let stagnationCounter = 0;

  // Seuil de stagnation et réchauffes modulés continûment par le ratio SNR
  const worstCaseCoolingSteps = Math.log(1e-4) / Math.log(0.99);
  const maxOuterIterations = Math.ceil(worstCaseCoolingSteps * (0.35 + 0.15 * explorationBeta));
  const maxReheatEvents = Math.max(2, Math.ceil(Math.log2(stateSpaceSize) * (0.8 + 0.4 * explorationBeta)));
  let reheatEventCount = 0;
  let outerIterationCount = 0;

  // --- ÉTAPE 4 : RECUIT SIMULÉ ULTRA ROBUSTE AVEC ADAPTATION DE RÉGIME ---
  while (temperature > minTemperature && outerIterationCount < maxOuterIterations) {
    outerIterationCount++;

    if (outerIterationCount % 15 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const energyVariances: number[] = [];
    
    // Probabilités des opérateurs de mutation modulées par le régime exploration/exploitation
    // Régime exploration : davantage de doubles swaps et de dispersion
    // Régime exploitation : prépondérance du ciblage par affinité et swaps fins
    const pSingleSwap = 0.70 + 0.10 * exploitationBeta; // 70% à 80%
    const pDoubleSwap = pSingleSwap + (0.20 * explorationBeta + 0.05 * exploitationBeta); // 15% (exploration) -> 5% (exploitation)

    for (let i = 0; i < iterationsPerTemp; i++) {
      let proposedCombo = [...currentCombo];
      const moveType = lcgRandom();

      // Opérateurs de mutations enrichis continus
      if (moveType < pSingleSwap) {
        // A. Single swap classique
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
      else if (moveType < pDoubleSwap) {
        // B. Double swap lourd (Exploration structurelle)
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
        // C. Mutation ciblée par affinité harmonique (Exploitation de co-occurrence)
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
        targetOutsiders,
        precomputedContext
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

    // Taux de refroidissement adaptatif basé sur l'agitation relative et l'exposant de Hurst
    const relativeAgitation = avgVariance / Math.max(Number.EPSILON, temperature);
    const coolingSignal = 1.0 / (1.0 + Math.exp(-relativeAgitation)); 
    
    // Si Hurst est grand (persistant, ex: 0.8), la recherche converge rapidement (on accélère le refroidissement en abaissant le taux de refroidissement)
    // Si Hurst est petit (anti-persistant, ex: 0.2), le refroidissement est ralenti pour prolonger l'exploration.
    const HurstRef = Math.max(0.01, Math.min(0.99, hurst));
    const hurstMultiplier = 1.0 / (2.0 * HurstRef); // HurstRef = 0.5 => 1.0, HurstRef = 0.8 => 0.625, HurstRef = 0.2 => 2.5
    
    // Le taux de refroidissement de base est ajusté de manière continue par Hurst et le régime SNR
    const baseCoolingRate = 0.85 * Math.pow(0.99, hurstMultiplier);
    // En exploitation (fort SNR), accélération continue de la convergence vers l'optimum
    const exploitationCoolingBoost = 0.04 * (exploitationBeta - 0.5);
    const adaptiveCoolingRate = Math.max(0.75, Math.min(0.995, baseCoolingRate + (0.14 * coolingSignal * hurstMultiplier) - exploitationCoolingBoost));
    
    temperature *= adaptiveCoolingRate;
  }

  return bestCombo.sort((a, b) => a - b);
};
