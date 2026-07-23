import { AlgoWeights, AlgoKey } from '../../shared/prediction.types';
import { LCG } from '../../utils/mathUtils';
import { computeAdaptiveCoeffs, AdaptiveCoeffs } from './zeroCopy';
export {};

interface TensorContext {
  drawId: string;
  targetWinners: number[];
  topologicalProximity?: Record<number, number>;
  matrix: Record<number, Record<AlgoKey, number>>;
}

interface WorkerConfig {
  populationSize: number;
  maxGenerations: number;
  mutationRate: number;
  hurst: number;
  entropy: number;
}

const ctx = self as unknown as Worker;

// Norme L1 stricte avec bornes dynamiques dérivées de l'Entropie
const normalizeWeights = (w: AlgoWeights, entropy: number): AlgoWeights => {
  const keys = Object.keys(w) as AlgoKey[];
  const numKeys = keys.length || 1;
  const total = keys.reduce((acc, k) => acc + Math.abs(w[k] ?? 0), 0);
  const normalized = { ...w };
  
  if (total <= 0) {
    keys.forEach(k => { normalized[k] = 1.0 / numKeys; });
    return normalized;
  }

  // Bornes dynamiques : Plus l'entropie est élevée (chaos), plus l'exploration est large.
  // Plus l'entropie est faible (ordre), plus on se resserre autour du poids uniforme.
  const uniformWeight = 1.0 / numKeys;
  const FLOOR = uniformWeight * Math.exp(-entropy); 
  const CEILING = uniformWeight * Math.exp(entropy);

  keys.forEach((k) => {
    let val = Math.abs(normalized[k]!) / total;
    val = Math.max(FLOOR, Math.min(CEILING, val));
    normalized[k] = parseFloat(val.toFixed(6));
  });

  // Correction du résidu de flottant (déterministe, toujours sur le premier élément)
  const currentSum = keys.reduce((acc, k) => acc + normalized[k]!, 0);
  if (Math.abs(currentSum - 1.0) > 1e-6) {
    const diff = 1.0 - currentSum;
    normalized[keys[0]] = parseFloat((normalized[keys[0]]! + diff).toFixed(6));
  }
  return normalized;
};


const evaluateTensorForSubset = (
  w: AlgoWeights,
  tensors: TensorContext[],
  coeffs: AdaptiveCoeffs
): number => {
  let totalHits = 0;
  for (const tensor of tensors) {
    const scores: { num: number; score: number }[] = [];
    const allScores: number[] = [];

    for (let num = 1; num <= 90; num++) {
      let sum = 0;
      const metrics = tensor.matrix[num];
      if (!metrics) continue;
      const keys = Object.keys(w) as AlgoKey[];
      for (const k of keys) {
        sum += (metrics[k] || 0) * (w[k] || 0);
      }
      allScores.push(sum);
      scores.push({ num, score: sum });
    }

    if (allScores.length === 0) continue;

    const sortedScores = [...allScores].sort((a, b) => a - b);
    const median = sortedScores[Math.floor(sortedScores.length / 2)];
    const mean = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    const variance = allScores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / allScores.length;
    const stdDev = Math.sqrt(variance) || Number.EPSILON;
    const slope = 1.0 / stdDev; 

    scores.forEach(s => {
      const zScore = (s.score - median) / stdDev;
      s.score = 100 / (1 + Math.exp(-slope * zScore));
    });

    scores.sort((a, b) => b.score !== a.score ? b.score - a.score : a.num - b.num);
    const top5 = scores.slice(0, 5).map(s => s.num);
    const top10 = scores.slice(0, 10).map(s => s.num);

    const getGridPos = (val: number) => {
      const row = Math.floor((val - 1) / 10);
      const col = (val - 1) % 10;
      return { row, col };
    };

    let totalContinLoss = 0;
    tensor.targetWinners.forEach((wVal) => {
      let maxSimForWinner = 1e-9;
      top5.forEach((p) => {
        let sim = 0.0;
        if (p === wVal) {
          sim = 1.0;
        } else {
          const linSim = Math.exp(-0.25 * Math.abs(p - wVal)) * (coeffs.cLinear / 0.25);
          const posP = getGridPos(p);
          const posW = getGridPos(wVal);
          const gridDist = Math.sqrt(Math.pow(posP.row - posW.row, 2) + Math.pow(posP.col - posW.col, 2));
          const gridSim = Math.exp(-0.35 * gridDist) * (coeffs.cGrid / 0.35);

          let mirrorSim = 0.0;
          if (p + wVal === 91) mirrorSim = coeffs.cMirror;
          const strP = p.toString();
          const revP = parseInt(strP.split("").reverse().join(""), 10);
          if (revP >= 1 && revP <= 90 && revP === wVal) mirrorSim = Math.max(mirrorSim, coeffs.cMirror * 0.9);

          let harmonicSim = 0.0;
          if (p % 10 === wVal % 10) harmonicSim = coeffs.cHarmonic;

          let decadeSim = 0.0;
          if (Math.floor((p - 1) / 10) === Math.floor((wVal - 1) / 10)) decadeSim = coeffs.cDecade;

          sim = Math.max(linSim, gridSim, mirrorSim, harmonicSim, decadeSim);
        }
        if (sim > maxSimForWinner) maxSimForWinner = sim;
      });
      totalContinLoss += (1.0 - maxSimForWinner);
    });

    const targetSize = tensor.targetWinners.length || 5;

    // Fitness structurelle basée sur la similarité au lieu de booléens purs
    const globalSimilarityScore = targetSize - totalContinLoss; 

    // Calcul de l'énergie topologique continue du top10 au lieu d'un comptage discret
    let top10Energy = 0;
    
    if (tensor.topologicalProximity) { // Use cached tensor data from tensorExtractor.ts
        top10.forEach((p, idx) => {
            const prox = tensor.topologicalProximity![p] || 0;
            const rankWeight = Math.exp(-0.2 * idx); 
            top10Energy += Math.tanh(prox * rankWeight);
        });
    } else {
        // Fallback pour les anciens caches de tenseurs
        tensor.targetWinners.forEach(wVal => {
          let nodeEnergy = 0;
          top10.forEach((p, idx) => {
            // Décroissance exponentielle de l'impact en fonction du rang dans le Top 10
            const rankWeight = Math.exp(-0.2 * idx); 
            const proximity = Math.exp(-0.15 * Math.abs(p - wVal)); // Basic proximity fallback
            nodeEnergy += proximity * rankWeight;
          });
          top10Energy += Math.tanh(nodeEnergy);
        });
    }

    // Récompense continue strictement analytique (Zéro compte discret)
    const baseReward = globalSimilarityScore * (targetSize / 2.5) + top10Energy;
    const exponentialBonus = Math.pow(globalSimilarityScore, 2.0) * (targetSize / 2.5);
    totalHits += baseReward + exponentialBonus;
  }
  return totalHits;
};

const evaluateTensor = (
  w: AlgoWeights,
  tensors: TensorContext[],
  coeffs: AdaptiveCoeffs
): number => {
  const numTensors = tensors.length;
  // Train/Val split (75% / 25%) si on a assez de tirages historiques pour prévenir le surapprentissage de façon cybernétique
  const trainRatio = numTensors >= 8 ? 0.75 : 1.0;
  const splitIndex = Math.floor(numTensors * trainRatio);

  if (splitIndex > 0 && splitIndex < numTensors) {
    const trainTensors = tensors.slice(0, splitIndex);
    const valTensors = tensors.slice(splitIndex);

    const fitnessTrain = evaluateTensorForSubset(w, trainTensors, coeffs);
    const fitnessVal = evaluateTensorForSubset(w, valTensors, coeffs);

    // Pénalisation continue d'overfitting : plus l'erreur/l'écart entre l'entraînement et la validation est grand,
    // plus on pénalise la fitness globale.
    const overfittingPenalty = 0.15 * Math.abs(fitnessTrain - fitnessVal);
    return fitnessTrain + 0.3 * fitnessVal - overfittingPenalty;
  }

  return evaluateTensorForSubset(w, tensors, coeffs);
};

ctx.onmessage = (e) => {
  const { type, payload } = e.data;
  if (type === 'start') {
    const { tensors, baseWeights, config, timeSignature } = payload as {
      tensors: TensorContext[];
      baseWeights: AlgoWeights;
      config: WorkerConfig;
      timeSignature: string;
    };

    // --- CALCUL DES COEFFICIENTS DE SIMILARITÉ ADAPTATIFS ---
    const coeffs: AdaptiveCoeffs = computeAdaptiveCoeffs(tensors);

    // Seed déterministe absolu synchronisé sur la signature temporelle (La taille d'historique)
    const prng = new LCG(`pso_${timeSignature}_${config.populationSize}`);
    const keys = Object.keys(baseWeights) as AlgoKey[];
    const M = keys.length;

    const Hurst = Math.max(Number.EPSILON, Math.min(1 - Number.EPSILON, config.hurst));
    const Entropy = Math.max(Number.EPSILON, Math.min(1 - Number.EPSILON, config.entropy));

    // Inertie de base dérivée continûment de la persistance (Hurst)
    const w_base = Math.tanh(Hurst);

    interface Particle {
      position: AlgoWeights;
      velocity: Record<AlgoKey, number>;
      bestPosition: AlgoWeights;
      bestFitness: number;
      fitness: number;
    }

    const particles: Particle[] = [];
    let globalBestPosition = normalizeWeights(baseWeights, Entropy);
    let globalBestFitness = evaluateTensor(globalBestPosition, tensors, coeffs);

    for (let i = 0; i < config.populationSize; i++) {
      let pos = i === 0 ? { ...globalBestPosition } : { ...baseWeights };
      
      if (i > 0) {
        // Perturbation déterministe dans l'espace du simplex
        const uniformWeight = 1.0 / M;
        keys.forEach(k => {
          const noise = (prng.next() - 0.5) * uniformWeight * 2 * Entropy; // Amplitude modulée par l'entropie
          pos[k] = Math.max(uniformWeight * Math.exp(-Entropy), Math.min(uniformWeight * Math.exp(Entropy), (pos[k] || 0) + noise));
        });
        pos = normalizeWeights(pos, Entropy);
      }

      const vel: Record<AlgoKey, number> = {} as any;
      keys.forEach(k => {
        vel[k] = (prng.next() - 0.5) * (1.0 / M) * 0.1 * (1.0 - Hurst); // Vitesse initiale plus faible si forte tendance
      });

      const fit = evaluateTensor(pos, tensors, coeffs);
      particles.push({ position: pos, velocity: vel, bestPosition: { ...pos }, bestFitness: fit, fitness: fit });

      if (fit > globalBestFitness) {
        globalBestFitness = fit;
        globalBestPosition = { ...pos };
      }
    }

    let staleCount = 0;
    // Seuil d'arrêt dynamique basé sur la racine carrée des générations (loi des rendements décroissants)
    const earlyStopThreshold = Math.ceil(Math.sqrt(config.maxGenerations));
    const fitnessHistory: number[] = [];

    for (let gen = 0; gen < config.maxGenerations; gen++) {
      const ratioProgress = gen / config.maxGenerations;
      
      // Amortissement continu : décroissance exponentielle modulée par l'entropie
      const omega = w_base * Math.exp(-Entropy * ratioProgress);

      // Coefficients cognitifs et sociaux dérivés continûment (Somme normalisée autour de 2.0, standard PSO)
      // Chaos (Hurst bas) favorise l'exploration (c1). Persistance (Hurst haut) favorise l'exploitation (c2).
      const c1 = 2.0 * (1.0 - Hurst) * (1.0 + Math.tanh(Entropy));
      const c2 = 2.0 * Hurst * (2.0 - Math.tanh(Entropy));

      let generationBestFitness = -Infinity;

      for (let pIdx = 0; pIdx < particles.length; pIdx++) {
        const p = particles[pIdx];
        const newPos = { ...p.position };
        const newVel = { ...p.velocity };

        keys.forEach(k => {
          const r1 = prng.next();
          const r2 = prng.next();

          const cognitiveTerm = c1 * r1 * ((p.bestPosition[k] || 0) - (p.position[k] || 0));
          const socialTerm = c2 * r2 * ((globalBestPosition[k] || 0) - (p.position[k] || 0));

          newVel[k] = omega * (p.velocity[k] || 0) + cognitiveTerm + socialTerm;
          
          // Vitesse maximale dynamique basée sur la taille du simplex
          const maxV = (1.0 / M) * (1.0 + Entropy);
          newVel[k] = Math.max(-maxV, Math.min(maxV, newVel[k]));

          newPos[k] = (p.position[k] || 0) + newVel[k];
        });

        p.position = normalizeWeights(newPos, Entropy);
        p.velocity = newVel;

        const fit = evaluateTensor(p.position, tensors, coeffs);
        p.fitness = fit;

        if (fit > generationBestFitness) generationBestFitness = fit;

        if (fit > p.bestFitness) {
          p.bestFitness = fit;
          p.bestPosition = { ...p.position };
        }

        if (fit > globalBestFitness) {
          globalBestFitness = fit;
          globalBestPosition = { ...p.position };
          staleCount = 0;
        }
      }

      fitnessHistory.push(globalBestFitness);
      // Fenêtre glissante pour détecter la convergence réelle (variance proche de 0)
      const windowSize = Math.min(10, fitnessHistory.length);
      const recentFitness = fitnessHistory.slice(-windowSize);
      const recentMean = recentFitness.reduce((a,b)=>a+b,0) / windowSize;
      const recentVar = recentFitness.reduce((a,b)=>a+Math.pow(b-recentMean,2),0) / windowSize;

      if (recentVar < 1e-6 || staleCount > earlyStopThreshold) {
        break; // Convergence statistique atteinte
      }
      
      if (generationBestFitness <= globalBestFitness) {
        staleCount++;
      }

      if (gen % 5 === 0) { // Réduction du spam de messages
        ctx.postMessage({ type: 'progress', data: { gen: gen + 1, bestFitness: globalBestFitness, bestGenome: globalBestPosition, diversity: recentVar } });
      }
    }

    ctx.postMessage({ type: 'result', data: { bestWeights: globalBestPosition, fitness: globalBestFitness } });
  }
};
