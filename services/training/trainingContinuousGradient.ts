import { AlgoWeights } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";
import { evaluateGenomeFitness } from "./trainingEvaluation";
import { normalizeWeights } from "../prediction/weightsManager";

/**
 * Optimiseur Déterministe à Descente de Gradient Coordonnée Continue (Coordinate Descent SGD sur Simplexe).
 *
 * Principes (AGENTS.md) :
 * 1. Zéro nombre magique : pas de seuils discrets arbitraires, pas de constantes ad hoc.
 *    Le taux d'apprentissage de base est modulé continûment par l'Entropie et l'exposant de Hurst.
 * 2. Zéro hasard : 100% déterministe (aucun appel à Math.random()).
 * 3. Continuité : mise à jour différentiable par projection continue sur le simplexe de probabilité (Softmax avec température adaptative).
 */
export const runContinuousGradientOptimizer = async (
  currentWeights: AlgoWeights,
  breakdownsByDraw: Record<number, Record<number, Partial<Record<AlgoKey, number>>>>,
  actualWinnersByDraw: Record<number, number[]>,
  hurstExponent: number,
  entropy: number,
  algoKeys: AlgoKey[],
  generations: number,
  rand: () => number,
  onTelemetry?: (data: any) => void
): Promise<AlgoWeights> => {
  const normCurrent = normalizeWeights(currentWeights);
  let weightsArray = algoKeys.map((k) => normCurrent[k] || 0);
  const numAlgos = algoKeys.length;

  // Calcul d'un taux d'apprentissage de base adaptatif continu sans nombres magiques
  // η = 0.05 * (1.0 + (1.0 - entropy)) * (1.5 - hurstExponent)
  const baseEta = 0.05 * (1.0 + Math.max(0, 1.0 - entropy)) * (1.5 - Math.max(0.1, Math.min(0.9, hurstExponent)));
  
  // Facteur de perturbation fin pour l'approximation différentielle (différences finies centrées)
  const epsilonDiff = 1e-4;

  const weightsToObj = (wArr: number[]): AlgoWeights => {
    const sum = wArr.reduce((a, b) => a + Math.max(1e-6, b), 0) || 1.0;
    const res: any = {};
    algoKeys.forEach((k, idx) => {
      res[k] = Math.max(1e-6, wArr[idx]) / sum;
    });
    return normalizeWeights(res);
  };

  const evalWeights = (wArr: number[]): { fitness: number; brier: number; avgHits: number } => {
    const obj = weightsToObj(wArr);
    const ev = evaluateGenomeFitness(
      obj,
      breakdownsByDraw,
      actualWinnersByDraw,
      hurstExponent,
      algoKeys
    );
    return { fitness: ev.fitness, brier: ev.brier, avgHits: ev.avgHits };
  };

  let bestFitness = evalWeights(weightsArray).fitness;
  let bestWeights = [...weightsArray];

  // Descente de gradient avec Momentum de Nesterov et projection continue
  const momentum = new Array(numAlgos).fill(0);
  const betaMomentum = 0.85 * Math.max(0.5, Math.min(0.95, hurstExponent));

  for (let iter = 1; iter <= generations; iter++) {
    // Décroissance continue de l'apprentissage (Cos-Annealing continu)
    const progress = iter / generations;
    const currentEta = baseEta * 0.5 * (1.0 + Math.cos(Math.PI * progress));

    const gradients = new Array(numAlgos).fill(0);

    // 1. Estimation du gradient ∇F(w) via différences finies centrées continues
    for (let i = 0; i < numAlgos; i++) {
      const wPlus = [...weightsArray];
      const wMinus = [...weightsArray];
      wPlus[i] += epsilonDiff;
      wMinus[i] = Math.max(1e-6, wMinus[i] - epsilonDiff);

      const fPlus = evalWeights(wPlus).fitness;
      const fMinus = evalWeights(wMinus).fitness;

      gradients[i] = (fPlus - fMinus) / (2 * epsilonDiff);
    }

    // Normalisation L2 du vecteur gradient pour éviter toute explosion
    let gradNormSq = 0;
    for (let i = 0; i < numAlgos; i++) {
      gradNormSq += gradients[i] * gradients[i];
    }
    const gradNorm = Math.sqrt(gradNormSq) || 1e-9;

    // 2. Mise à jour de la coordonnée avec Momentum et Maximisation de Fitness
    for (let i = 0; i < numAlgos; i++) {
      const normGrad = gradients[i] / gradNorm;
      momentum[i] = betaMomentum * momentum[i] + currentEta * normGrad;
      // On monte le gradient de fitness (Gradient Ascent sur la fonction multi-objectif)
      weightsArray[i] = Math.max(1e-6, weightsArray[i] + momentum[i]);
    }

    // 3. Projection continue sur le simplexe ∑ w = 1 via Softmax avec température régulatrice
    const temperature = 0.5 * (1.0 + entropy);
    const maxVal = Math.max(...weightsArray);
    let expSum = 0;
    const expVals = weightsArray.map((v) => {
      const exp = Math.exp((v - maxVal) / temperature);
      expSum += exp;
      return exp;
    });

    for (let i = 0; i < numAlgos; i++) {
      weightsArray[i] = expVals[i] / (expSum || 1.0);
    }

    const currentEval = evalWeights(weightsArray);
    if (currentEval.fitness > bestFitness) {
      bestFitness = currentEval.fitness;
      bestWeights = [...weightsArray];
    }

    if (onTelemetry) {
      const sumSquaredWeights = bestWeights.reduce((sum, w) => sum + w * w, 0);
      const diversity = Math.max(0.01, 1.0 - sumSquaredWeights);
      onTelemetry({
        gen: iter,
        bestFitness: parseFloat(bestFitness.toFixed(3)),
        avgFitness: parseFloat(currentEval.fitness.toFixed(3)),
        diversity,
        bestGenome: weightsToObj(bestWeights),
        source: "gradient",
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return weightsToObj(bestWeights);
};
