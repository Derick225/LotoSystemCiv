import { EmpiricalCalibration, FALLBACK_CALIBRATION } from "../../shared/prediction.types";
import { ScoredNumber } from "./scoringEngine";
import { calculateACValue } from "../mathService";
import { ScoreBreakdown } from "../../shared/prediction.types";
import { calculateGeneticDiversityIndex } from "./diversityService";


const DOMAIN_SIZE = 90;
const DRAW_SIZE = 5;

export const calculateCombinationEnergy = (
  combo: number[],
  scoresMap: Map<number, number>,
  affinityMap: Float32Array[],
  calibration: EmpiricalCalibration = FALLBACK_CALIBRATION,
  lastDraw?: number[],
  breakdownsMap?: Map<number, ScoreBreakdown>,
): number => {
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

  let energy = -(baseScoreSum + affinitySum); // Objective is to minimize energy (maximize score + affinity)

  // 1. Anti-Répétition : Loi Hypergéométrique exacte
  if (lastDraw && lastDraw.length > 0) {
    const intersectionCount = combo.filter((n) => lastDraw.includes(n)).length;
    const expectedIntersection = Math.pow(DRAW_SIZE, 2.0) / DOMAIN_SIZE;
    const varIntersection = DRAW_SIZE * (DRAW_SIZE / DOMAIN_SIZE) * (1.0 - DRAW_SIZE / DOMAIN_SIZE) * ((DOMAIN_SIZE - DRAW_SIZE) / (DOMAIN_SIZE - 1.0));
    const stdIntersection = Math.sqrt(Math.max(Number.EPSILON, varIntersection));
    const zIntersection = Math.max(0.0, intersectionCount - expectedIntersection) / stdIntersection;
    energy += Math.pow(zIntersection, 2.0);
  }

  // 2. Contrainte de Somme : Z-score Gaussien Empirique
  const sum = combo.reduce((a, b) => a + b, 0);
  const zSum = (sum - calibration.meanSum) / Math.max(Number.EPSILON, calibration.stdSum);
  energy += Math.pow(zSum, 2.0);

  // 3. Parité : Loi binomiale B(5, 0.5)
  const evens = combo.filter((n) => n % 2 === 0).length;
  const expectedEvens = DRAW_SIZE / 2.0;
  const stdEvens = Math.sqrt(DRAW_SIZE * 0.25);
  const zEvens = (evens - expectedEvens) / stdEvens;
  energy += Math.pow(zEvens, 2.0);

  // 4. Dizaines (Décades) : Loi Multinomiale Accrue
  const decades = new Array(10).fill(0);
  for (const num of combo) decades[Math.floor(num / 10.0)]++;
  
  const maxDecade = decades.reduce((a, b) => Math.max(a, b), 0);
  const expectedDecade = DRAW_SIZE / 10.0;
  const stdDecades = Math.sqrt(DRAW_SIZE * (1.0 / 10.0) * (9.0 / 10.0));
  const zDecades = Math.max(0.0, maxDecade - expectedDecade) / stdDecades;
  energy += Math.pow(zDecades, 2.0);

  // 5. Amplitude : Z-score Gaussien Empirique
  const sortedCombo = [...combo].sort((a, b) => a - b);
  const amplitude = sortedCombo[sortedCombo.length - 1] - sortedCombo[0];
  const zAmp = (amplitude - calibration.meanAmplitude) / Math.max(Number.EPSILON, calibration.stdAmplitude);
  energy += Math.pow(zAmp, 2.0);

  // 6. Séquences (Consécutives) : Pénalité dérivée de Poisson
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
  const expectedConsecutive = 1.0 + lambda; // Continuous estimation
  const zConsecutive = Math.max(0.0, maxConsecutive - expectedConsecutive) / Math.max(Number.EPSILON, Math.sqrt(lambda));
  energy += Math.pow(zConsecutive, 2.0);

  // 7. AC (Complexité Arithmétique) : Z-score Gaussien Empirique
  const ac = calculateACValue(sortedCombo);
  const zAC = (ac - calibration.meanAC) / Math.max(Number.EPSILON, calibration.stdAC);
  energy += Math.pow(zAC, 2.0) * Math.exp(-Math.abs(zAC)); // Soft damping using Laplace kernel

  // 8. Pénalité de Diversité Génétique : similaire cosinus (zéro monoculture)
  if (breakdownsMap && combo.length >= 2) {
    const smallBreakdowns: Record<number, ScoreBreakdown> = {};
    for (const num of combo) {
      const bd = breakdownsMap.get(num);
      if (bd) smallBreakdowns[num] = bd;
    }
    const diversity = calculateGeneticDiversityIndex(combo, smallBreakdowns);
    energy += diversity.penalty;
  }

  return energy;
};

export const generateCombination = (
  sortedScores: ScoredNumber[],
  affinityMap: Float32Array[],
  calibration: EmpiricalCalibration,
  outsiderCount: number,
  lastDraw: number[] | undefined,
  regimeStateNormalized: number,
): number[] => {
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
  
  // Seed purement déterministe via hachage canonique continu (FNV-1a variant)
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

  const targetOutsiders = Math.round(DRAW_SIZE * outsiderRatio);
  const targetTop = Math.max(0, DRAW_SIZE - targetOutsiders);
  
  const tempGlouton = new Set<number>();
  for (let i = 0; i < topPool.length && tempGlouton.size < targetTop; i++) tempGlouton.add(topPool[i]);
  for (let i = 0; i < outsiderPool.length && tempGlouton.size < DRAW_SIZE; i++) tempGlouton.add(outsiderPool[i]);
  
  let currentCombo = Array.from(tempGlouton);
  if (currentCombo.length !== DRAW_SIZE) {
    currentCombo = sortedScores.slice(0, DRAW_SIZE).map(s => s.num);
  }

  let currentEnergy = calculateCombinationEnergy(currentCombo, scoresMap, affinityMap, calibration, lastDraw, breakdownsMap);
  let bestCombo = [...currentCombo];
  let bestEnergy = currentEnergy;

  const initialEnergyMagnitude = Math.max(Number.EPSILON, Math.abs(currentEnergy));
  let temperature = initialEnergyMagnitude * Math.exp(regimeStateNormalized); // Activation exponentielle plutôt que multilication
  
  const minTemperature = initialEnergyMagnitude * Math.exp(-10.0); // Précision relative définie par e^-10
  const stateSpaceSize = DRAW_SIZE * (DOMAIN_SIZE - DRAW_SIZE);
  // Logarithmic scaling for iterations
  const iterationsPerTemp = Math.max(5, Math.floor(Math.log(stateSpaceSize) * 3.0 * Math.exp(regimeStateNormalized)));

  while (temperature > minTemperature) {
    const energyVariances: number[] = [];
    for (let i = 0; i < iterationsPerTemp; i++) {
      const indexToSwap = Math.floor(lcgRandom() * DRAW_SIZE);
      const isOutsiderSlot = indexToSwap >= targetTop;
      const candidateList = isOutsiderSlot && outsiderPool.length > 0 ? outsiderPool : topPool;
      
      let newNum = candidateList[Math.floor(lcgRandom() * candidateList.length)];
      let attempts = 0;
      while (currentCombo.includes(newNum) && attempts < candidateList.length) {
        newNum = candidateList[Math.floor(lcgRandom() * candidateList.length)];
        attempts++;
      }

      const proposedCombo = [...currentCombo];
      proposedCombo[indexToSwap] = newNum;
      const proposedEnergy = calculateCombinationEnergy(proposedCombo, scoresMap, affinityMap, calibration, lastDraw, breakdownsMap);
      
      energyVariances.push(Math.abs(proposedEnergy - currentEnergy));

      if (proposedEnergy < currentEnergy) {
        currentCombo = proposedCombo;
        currentEnergy = proposedEnergy;
        if (proposedEnergy < bestEnergy) {
          bestCombo = [...currentCombo];
          bestEnergy = proposedEnergy;
        }
      } else {
        const acceptanceProbability = Math.exp(-(proposedEnergy - currentEnergy) / temperature);
        if (lcgRandom() < acceptanceProbability) {
          currentCombo = proposedCombo;
          currentEnergy = proposedEnergy;
        }
      }
    }

    const avgVariance = energyVariances.length > 0 
      ? energyVariances.reduce((a, b) => a + b, 0.0) / energyVariances.length 
      : 0.0;

    const relativeAgitation = avgVariance / Math.max(Number.EPSILON, temperature);
    // Sigmoidal cooling bound
    const coolingSignal = 1.0 / (1.0 + Math.exp(-relativeAgitation)); 
    const adaptiveCoolingRate = 0.85 + (0.14 * coolingSignal); // Maps continuous relative agitation into [0.85, 0.99] strictly
    
    temperature *= adaptiveCoolingRate;
  }

  return bestCombo.sort((a, b) => a - b);
};
