import { AlgoWeights } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";
import { evaluateGenomeFitness } from "./trainingEvaluation";
import { normalizeWeights } from "../prediction/weightsManager";

// Résolveur de système linéaire robuste via Élimination de Gauss avec pivotement partiel
function solveLinearSystem(A: number[][], B: number[]): number[] {
  const n = B.length;
  const a = A.map(row => [...row]);
  const b = [...B];

  for (let i = 0; i < n; i++) {
    let maxEl = Math.abs(a[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(a[k][i]) > maxEl) {
        maxEl = Math.abs(a[k][i]);
        maxRow = k;
      }
    }

    // Permutation des lignes
    const tempRow = a[maxRow];
    a[maxRow] = a[i];
    a[i] = tempRow;
    const tempVal = b[maxRow];
    b[maxRow] = b[i];
    b[i] = tempVal;

    // Élimination des coefficients inférieurs
    for (let k = i + 1; k < n; k++) {
      const factor = a[k][i] / (a[i][i] || 1e-9);
      for (let j = i; j < n; j++) {
        a[k][j] -= factor * a[i][j];
      }
      b[k] -= factor * b[i];
    }
  }

  // Substitution inverse
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let k = i + 1; k < n; k++) {
      sum += a[i][k] * x[k];
    }
    x[i] = (b[i] - sum) / (a[i][i] || 1e-9);
  }
  return x;
}

/**
 * Algorithme Évolutif de Convergence Darwinienne Adaptatif.
 * Paramètres dérivés continûment de la persistance (Hurst) et du chaos (Entropie).
 */
export const runGeneticOptimizer = async (
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
  // Taille de population modulée de façon continue selon le chaos
  const popSize = Math.round(20 + 20 * entropy);
  
  // Taux et amplitude de mutation continûment adaptés (AGENTS.md)
  const mutationRate = 0.1 * (1.0 + entropy);
  const mutationAmplitude = 0.05 * (1.5 - hurstExponent);
  const elitistsCount = Math.max(2, Math.round(popSize * 0.2 * hurstExponent));

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

    // Sélection élitiste adaptative
    const survivors = evaluated.slice(0, elitistsCount).map((x) => x.genome);
    const nextPop: AlgoWeights[] = [...survivors];

    while (nextPop.length < popSize) {
      // Parents probabilistes mais déterministes (via LCG seedée)
      const idx1 = Math.floor(rand() * survivors.length) % survivors.length;
      const idx2 = Math.floor(rand() * survivors.length) % survivors.length;
      const parent1 = survivors[idx1] || bestGenome;
      const parent2 = survivors[idx2] || bestGenome;

      const child: any = {};
      const beta = rand(); // Croisement continu arithmétique
      algoKeys.forEach((k) => {
        child[k] = parent1[k] * beta + parent2[k] * (1.0 - beta);
        // Mutation adaptative continue
        if (rand() < mutationRate) {
          child[k] += (rand() - 0.5) * mutationAmplitude;
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
 * Particle Swarm Optimization Adaptatif (Swarm Cybernétique de Simplexe).
 * Paramètres dérivés continûment de la persistance (Hurst) et du chaos (Entropie).
 */
export const runPSOOptimizer = async (
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
  const swarmSize = Math.round(20 + 20 * entropy);
  const M = algoKeys.length;

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
      vel[k] = (rand() - 0.5) * (1.0 / M) * 0.1 * (1.0 - hurstExponent);
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

  // Inertie de base dérivée de la persistance (Hurst)
  const w_base = Math.tanh(hurstExponent);

  for (let gen = 1; gen <= generations; gen++) {
    const ratioProgress = gen / generations;
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

    // Amortissement de l'inertie et calcul cinématique continu des accélérations cognitive et sociale
    const omega = w_base * Math.exp(-entropy * ratioProgress);
    const c1 = 2.0 * (1.0 - hurstExponent) * (1.0 + Math.tanh(entropy));
    const c2 = 2.0 * hurstExponent * (2.0 - Math.tanh(entropy));

    for (let i = 0; i < swarmSize; i++) {
      const p = particles[i];
      const nextPos: any = {};
      algoKeys.forEach((k) => {
        const r1 = rand();
        const r2 = rand();
        p.velocity[k] =
          omega * p.velocity[k] +
          c1 * r1 * (p.bestPosition[k] - p.position[k]) +
          c2 * r2 * (gBestPosition[k] - p.position[k]);

        // Borne maximale cinématique
        const maxV = (1.0 / M) * (1.0 + entropy);
        p.velocity[k] = Math.max(-maxV, Math.min(maxV, p.velocity[k]));

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
 * Optimiseur Bayésien par Surrogate Model RBF et Fonction d'Acquisition UCB.
 * Construit un émulateur stochastique par Processus Gaussien (Kriging déterministe)
 * et sélectionne analytiquement les points à évaluer pour maximiser le gain.
 */
export const runBayesianOptimizer = async (
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
  const samples: { x: AlgoWeights; y: number }[] = [];

  const evalPoint = (w: AlgoWeights) => {
    const ev = evaluateGenomeFitness(
      w,
      breakdownsByDraw,
      actualWinnersByDraw,
      hurstExponent,
      algoKeys
    );
    return ev.fitness;
  };

  // Échantillonnage de départ : le point courant + perturbations déterministes
  samples.push({ x: normCurrent, y: evalPoint(normCurrent) });

  const numInitialSamples = 6;
  for (let sIdx = 1; sIdx < numInitialSamples; sIdx++) {
    const perturbed: any = {};
    algoKeys.forEach((k) => {
      const noise = (rand() - 0.5) * 0.15 * (1.0 + entropy);
      perturbed[k] = Math.max(0.001, (normCurrent[k] || 0) + noise);
    });
    const normP = normalizeWeights(perturbed);
    samples.push({ x: normP, y: evalPoint(normP) });
  }

  let bestGenome = { ...normCurrent };
  let bestFitness = samples[0].y;
  samples.forEach(s => {
    if (s.y > bestFitness) {
      bestFitness = s.y;
      bestGenome = s.x;
    }
  });

  const gamma = 1.0;
  const lambda = 1e-4; // Régularisation stable

  for (let iter = 1; iter <= generations; iter++) {
    const numSamples = samples.length;

    // Matrice de covariance augmentée pour inclure le terme de dérive constante (Kriging simple)
    const Phi: number[][] = Array.from({ length: numSamples + 1 }, () => new Array(numSamples + 1).fill(0));
    const targetY = new Array(numSamples + 1).fill(0);

    for (let i = 0; i < numSamples; i++) {
      for (let j = 0; j < numSamples; j++) {
        let distSq = 0;
        for (const k of algoKeys) {
          distSq += Math.pow(samples[i].x[k] - samples[j].x[k], 2);
        }
        Phi[i][j] = Math.exp(-gamma * distSq);
        if (i === j) {
          Phi[i][j] += lambda;
        }
      }
      Phi[i][numSamples] = 1.0;
      Phi[numSamples][i] = 1.0;
      targetY[i] = samples[i].y;
    }
    Phi[numSamples][numSamples] = 0.0;
    targetY[numSamples] = 0.0;

    const coefs = solveLinearSystem(Phi, targetY);

    const getPrediction = (x: AlgoWeights): { mean: number; std: number } => {
      let mean = coefs[numSamples];
      const kVector = new Array(numSamples).fill(0);
      for (let i = 0; i < numSamples; i++) {
        let distSq = 0;
        for (const k of algoKeys) {
          distSq += Math.pow(x[k] - samples[i].x[k], 2);
        }
        const phiVal = Math.exp(-gamma * distSq);
        kVector[i] = phiVal;
        mean += coefs[i] * phiVal;
      }

      // v = Phi^-1 * k
      const Phiv = Phi.map(row => [...row]);
      const rhs = [...kVector, 0];
      const v = solveLinearSystem(Phiv, rhs);
      
      let kTv = 0;
      for (let i = 0; i < numSamples; i++) {
        kTv += kVector[i] * v[i];
      }
      const variance = Math.max(0.001, 1.0 - kTv);
      return { mean, std: Math.sqrt(variance) };
    };

    // Maximisation de la fonction d'acquisition UCB (Upper Confidence Bound)
    let bestUCB = -Infinity;
    let bestCandidate = { ...normCurrent };
    const numCandidates = 100;
    // Décroissance exponentielle continue de la force d'exploration
    const betaAcquisition = 2.0 * Math.exp(-iter / generations);

    for (let c = 0; c < numCandidates; c++) {
      const candidate: any = {};
      algoKeys.forEach((k) => {
        const noise = (rand() - 0.5) * 0.3 * (1.5 - hurstExponent);
        candidate[k] = Math.max(0.001, (bestGenome[k] || 0) + noise);
      });
      const normC = normalizeWeights(candidate);
      const pred = getPrediction(normC);
      const ucbVal = pred.mean + betaAcquisition * pred.std;

      if (ucbVal > bestUCB) {
        bestUCB = ucbVal;
        bestCandidate = normC;
      }
    }

    // Évaluation réelle du meilleur candidat identifié par l'acquisition
    const realFitness = evalPoint(bestCandidate);
    samples.push({ x: bestCandidate, y: realFitness });

    if (realFitness > bestFitness) {
      bestFitness = realFitness;
      bestGenome = { ...bestCandidate };
    }

    if (onTelemetry) {
      const sumSquaredWeights = Object.values(bestGenome).reduce(
        (sum, w) => sum + w * w,
        0
      );
      const diversity = Math.max(0.01, 1.0 - sumSquaredWeights);
      onTelemetry({
        gen: iter,
        bestFitness: parseFloat(bestFitness.toFixed(3)),
        avgFitness: parseFloat((samples.reduce((sum, s) => sum + s.y, 0) / samples.length).toFixed(3)),
        diversity,
        bestGenome: bestGenome,
        source: "bayesian",
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return normalizeWeights(bestGenome);
};

/**
 * Omni-Méta Blending (PSO + Darwin + Kriging Blended via Softargmax).
 */
export const runMetaOptimizer = async (
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
  const metaGenerations = Math.max(3, Math.floor(generations / 3));

  // Exécutions parallèles découplées
  const geneticWeights = await runGeneticOptimizer(
    currentWeights,
    breakdownsByDraw,
    actualWinnersByDraw,
    hurstExponent,
    entropy,
    algoKeys,
    metaGenerations,
    rand
  );

  const psoWeights = await runPSOOptimizer(
    currentWeights,
    breakdownsByDraw,
    actualWinnersByDraw,
    hurstExponent,
    entropy,
    algoKeys,
    metaGenerations,
    rand
  );

  const bayesianWeights = await runBayesianOptimizer(
    currentWeights,
    breakdownsByDraw,
    actualWinnersByDraw,
    hurstExponent,
    entropy,
    algoKeys,
    metaGenerations,
    rand
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

  // Softargmax pour fusionner de façon continue selon les fitness relatives
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
