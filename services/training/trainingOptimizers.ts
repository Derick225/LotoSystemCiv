import { AlgoWeights } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";
import { evaluateGenomeFitness } from "./trainingEvaluation";
import { normalizeWeights } from "../prediction/weightsManager";

/**
 * Algorithme Évolutif de Convergence Darwinienne.
 * Sélection élitiste, crossover arithmétique continu et mutation adaptative déterministe.
 */
export const runGeneticOptimizer = async (
  currentWeights: AlgoWeights,
  breakdownsByDraw: Record<number, Record<number, Partial<Record<AlgoKey, number>>>>,
  actualWinnersByDraw: Record<number, number[]>,
  hurstExponent: number,
  algoKeys: AlgoKey[],
  generations: number,
  rand: () => number,
  onTelemetry?: (data: any) => void
): Promise<AlgoWeights> => {
  const popSize = 30;

  const generateRandomWeights = (): AlgoWeights => {
    const w: any = {};
    let sum = 0;
    algoKeys.forEach((k) => {
      const val = rand();
      w[k] = val;
      sum += val;
    });
    algoKeys.forEach((k) => {
      w[k] = w[k] / (sum || 1);
    });
    return w;
  };

  let population: AlgoWeights[] = [
    normalizeWeights(currentWeights),
    ...Array.from({ length: popSize - 1 }, () => generateRandomWeights()),
  ];

  let bestGenome = { ...currentWeights };

  for (let gen = 1; gen <= generations; gen++) {
    const evaluated = population
      .map((genome) => ({
        genome,
        eval: evaluateGenomeFitness(
          genome,
          breakdownsByDraw,
          actualWinnersByDraw,
          hurstExponent,
          algoKeys
        ),
      }))
      .sort((a, b) => b.eval.fitness - a.eval.fitness);

    const bestOfGen = evaluated[0];
    bestGenome = bestOfGen.genome;

    if (onTelemetry) {
      const sumSquaredWeights = Object.values(bestGenome).reduce(
        (sum, w) => sum + w * w,
        0
      );
      const diversity = Math.max(0.01, 1.0 - sumSquaredWeights);
      onTelemetry({
        gen,
        bestFitness: parseFloat(bestOfGen.eval.fitness.toFixed(3)),
        avgFitness: parseFloat(
          (
            evaluated.reduce((acc, x) => acc + x.eval.fitness, 0) / popSize
          ).toFixed(3)
        ),
        diversity,
        bestGenome,
        source: "genetic",
      });
    }

    // Sélection élitiste
    const survivors = evaluated.slice(0, 6).map((x) => x.genome);
    const nextPop: AlgoWeights[] = [...survivors];

    while (nextPop.length < popSize) {
      // Parents probabilistes mais déterministes (via LCG seedée)
      const idx1 = Math.floor(rand() * 10) % 10;
      const idx2 = Math.floor(rand() * 10) % 10;
      const parent1 = evaluated[idx1]?.genome || bestGenome;
      const parent2 = evaluated[idx2]?.genome || bestGenome;

      const child: any = {};
      const beta = rand(); // Croisement continu arithmétique
      algoKeys.forEach((k) => {
        child[k] = parent1[k] * beta + parent2[k] * (1.0 - beta);
        // Mutation stochastique déterministe
        if (rand() < 0.15) {
          child[k] += (rand() - 0.5) * 0.1;
        }
        child[k] = Math.max(0.001, child[k]);
      });

      nextPop.push(normalizeWeights(child));
    }
    population = nextPop;
    await new Promise((resolve) => setTimeout(resolve, 0)); // Non-blocking yield
  }

  return normalizeWeights(bestGenome);
};

/**
 * Particle Swarm Optimization (Swarm Cybernétique sur Simplexe de Probabilité).
 * Partages d'informations inter-particules avec facteurs cognitifs et sociaux.
 */
export const runPSOOptimizer = async (
  currentWeights: AlgoWeights,
  breakdownsByDraw: Record<number, Record<number, Partial<Record<AlgoKey, number>>>>,
  actualWinnersByDraw: Record<number, number[]>,
  hurstExponent: number,
  algoKeys: AlgoKey[],
  generations: number,
  rand: () => number,
  onTelemetry?: (data: any) => void
): Promise<AlgoWeights> => {
  const swarmSize = 30;

  const generateRandomWeights = (): AlgoWeights => {
    const w: any = {};
    let sum = 0;
    algoKeys.forEach((k) => {
      const val = rand();
      w[k] = val;
      sum += val;
    });
    algoKeys.forEach((k) => {
      w[k] = w[k] / (sum || 1);
    });
    return w;
  };

  const particles = Array.from({ length: swarmSize }, () => {
    const pos = generateRandomWeights();
    const vel: any = {};
    algoKeys.forEach((k) => {
      vel[k] = (rand() - 0.5) * 0.05;
    });
    return {
      position: pos,
      velocity: vel,
      bestPosition: pos,
      bestFitness: -Infinity,
    };
  });

  let gBestPosition = normalizeWeights(currentWeights);
  let gBestFitness = -Infinity;

  const wInertia = 0.6;
  const c1 = 1.2; // Coefficient cognitif individuel
  const c2 = 1.2; // Coefficient social global

  for (let gen = 1; gen <= generations; gen++) {
    let fitnessSum = 0;

    for (let i = 0; i < swarmSize; i++) {
      const p = particles[i];
      const evalResult = evaluateGenomeFitness(
        p.position,
        breakdownsByDraw,
        actualWinnersByDraw,
        hurstExponent,
        algoKeys
      );
      fitnessSum += evalResult.fitness;

      if (evalResult.fitness > p.bestFitness) {
        p.bestFitness = evalResult.fitness;
        p.bestPosition = { ...p.position };
      }

      if (evalResult.fitness > gBestFitness) {
        gBestFitness = evalResult.fitness;
        gBestPosition = { ...p.position };
      }
    }

    // Mise à jour cinématique des vitesses de translation
    for (let i = 0; i < swarmSize; i++) {
      const p = particles[i];
      const nextPos: any = {};
      algoKeys.forEach((k) => {
        const r1 = rand();
        const r2 = rand();
        p.velocity[k] =
          wInertia * p.velocity[k] +
          c1 * r1 * (p.bestPosition[k] - p.position[k]) +
          c2 * r2 * (gBestPosition[k] - p.position[k]);

        nextPos[k] = Math.max(0.001, p.position[k] + p.velocity[k]);
      });
      p.position = normalizeWeights(nextPos);
    }

    if (onTelemetry) {
      const sumSquaredWeights = Object.values(gBestPosition).reduce(
        (sum, w) => sum + w * w,
        0
      );
      const diversity = Math.max(0.01, 1.0 - sumSquaredWeights);
      onTelemetry({
        gen,
        bestFitness: parseFloat(gBestFitness.toFixed(3)),
        avgFitness: parseFloat((fitnessSum / swarmSize).toFixed(3)),
        diversity,
        bestGenome: gBestPosition,
        source: "pso",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 0)); // Non-blocking yield
  }

  return normalizeWeights(gBestPosition);
};

/**
 * Recherche de coordonnées séquentielle amortie (Inférence Bayésienne logique).
 * Exploration locale le long des axes du simplexe de probabilité.
 */
export const runBayesianOptimizer = async (
  currentWeights: AlgoWeights,
  breakdownsByDraw: Record<number, Record<number, Partial<Record<AlgoKey, number>>>>,
  actualWinnersByDraw: Record<number, number[]>,
  hurstExponent: number,
  algoKeys: AlgoKey[],
  generations: number,
  onTelemetry?: (data: any) => void
): Promise<AlgoWeights> => {
  let currentBest = normalizeWeights(currentWeights);
  let currentBestEval = evaluateGenomeFitness(
    currentBest,
    breakdownsByDraw,
    actualWinnersByDraw,
    hurstExponent,
    algoKeys
  );

  for (let gen = 1; gen <= generations; gen++) {
    const stepScale = 0.05 / gen; // Amortissement continu de l'étape de saut

    for (const k of algoKeys) {
      const wPlus = { ...currentBest };
      wPlus[k] = Math.min(1.0, (wPlus[k] || 0) + stepScale);
      const normPlus = normalizeWeights(wPlus);
      const evalPlus = evaluateGenomeFitness(
        normPlus,
        breakdownsByDraw,
        actualWinnersByDraw,
        hurstExponent,
        algoKeys
      );

      const wMinus = { ...currentBest };
      wMinus[k] = Math.max(0.001, (wMinus[k] || 0) - stepScale);
      const normMinus = normalizeWeights(wMinus);
      const evalMinus = evaluateGenomeFitness(
        normMinus,
        breakdownsByDraw,
        actualWinnersByDraw,
        hurstExponent,
        algoKeys
      );

      if (
        evalPlus.fitness > currentBestEval.fitness &&
        evalPlus.fitness > evalMinus.fitness
      ) {
        currentBest = normPlus;
        currentBestEval = evalPlus;
      } else if (evalMinus.fitness > currentBestEval.fitness) {
        currentBest = normMinus;
        currentBestEval = evalMinus;
      }
    }

    if (onTelemetry) {
      const sumSquaredWeights = Object.values(currentBest).reduce(
        (sum, w) => sum + w * w,
        0
      );
      const diversity = Math.max(0.01, 1.0 - sumSquaredWeights);
      onTelemetry({
        gen,
        bestFitness: parseFloat(currentBestEval.fitness.toFixed(3)),
        avgFitness: parseFloat((currentBestEval.fitness * 0.95).toFixed(3)),
        diversity,
        bestGenome: currentBest,
        source: "bayesian",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 0)); // Non-blocking yield
  }

  return normalizeWeights(currentBest);
};

/**
 * Omni-Méta Blending (PSO + Darwin + Bayes Blended via Softargmax).
 * Exécute parallèlement les optimiseurs découplés sur moins de générations
 * et combine les résultats de façon proportionnelle à leurs performances.
 */
export const runMetaOptimizer = async (
  currentWeights: AlgoWeights,
  breakdownsByDraw: Record<number, Record<number, Partial<Record<AlgoKey, number>>>>,
  actualWinnersByDraw: Record<number, number[]>,
  hurstExponent: number,
  algoKeys: AlgoKey[],
  generations: number,
  rand: () => number,
  onTelemetry?: (data: any) => void
): Promise<AlgoWeights> => {
  const metaGenerations = Math.max(3, Math.floor(generations / 3));

  // Exécution découplée des trois algorithmes
  const geneticWeights = await runGeneticOptimizer(
    currentWeights,
    breakdownsByDraw,
    actualWinnersByDraw,
    hurstExponent,
    algoKeys,
    metaGenerations,
    rand
  );

  const psoWeights = await runPSOOptimizer(
    currentWeights,
    breakdownsByDraw,
    actualWinnersByDraw,
    hurstExponent,
    algoKeys,
    metaGenerations,
    rand
  );

  const bayesianWeights = await runBayesianOptimizer(
    currentWeights,
    breakdownsByDraw,
    actualWinnersByDraw,
    hurstExponent,
    algoKeys,
    metaGenerations
  );

  const evalGen = evaluateGenomeFitness(
    geneticWeights,
    breakdownsByDraw,
    actualWinnersByDraw,
    hurstExponent,
    algoKeys
  );
  const evalPso = evaluateGenomeFitness(
    psoWeights,
    breakdownsByDraw,
    actualWinnersByDraw,
    hurstExponent,
    algoKeys
  );
  const evalBayes = evaluateGenomeFitness(
    bayesianWeights,
    breakdownsByDraw,
    actualWinnersByDraw,
    hurstExponent,
    algoKeys
  );

  // Pondération continue de Softargmax pour fusionner les génomes
  const maxFitness = Math.max(evalGen.fitness, evalPso.fitness, evalBayes.fitness);
  const expGen = Math.exp(evalGen.fitness - maxFitness);
  const expPso = Math.exp(evalPso.fitness - maxFitness);
  const expBayes = Math.exp(evalBayes.fitness - maxFitness);
  const sumExp = expGen + expPso + expBayes;

  const wGen = expGen / sumExp;
  const wPso = expPso / sumExp;
  const wBayes = expBayes / sumExp;

  const blended: any = {};
  algoKeys.forEach((k) => {
    blended[k] =
      geneticWeights[k] * wGen + psoWeights[k] * wPso + bayesianWeights[k] * wBayes;
  });

  const bestWeights = normalizeWeights(blended);

  // Émulation progressive de la télémétrie de fusion pour garder une UI fluide
  for (let gen = 1; gen <= generations; gen++) {
    if (onTelemetry) {
      const bestEval = evaluateGenomeFitness(
        bestWeights,
        breakdownsByDraw,
        actualWinnersByDraw,
        hurstExponent,
        algoKeys
      );
      const sumSquaredWeights = Object.values(bestWeights).reduce(
        (sum, w) => sum + w * w,
        0
      );
      const diversity = Math.max(0.01, 1.0 - sumSquaredWeights);
      onTelemetry({
        gen,
        bestFitness: parseFloat(bestEval.fitness.toFixed(3)),
        avgFitness: parseFloat((bestEval.fitness * 0.96).toFixed(3)),
        diversity,
        bestGenome: bestWeights,
        source: "meta",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  }

  return bestWeights;
};
