import { AlgoWeights, AlgoKey } from '../../shared/prediction.types';
import { LCG } from '../../utils/mathUtils';

export {};

interface TensorContext {
  drawId: string;
  targetWinners: number[];
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

// Norme L1 stricte avec bornes dynamiques
const normalizeWeights = (w: AlgoWeights): AlgoWeights => {
  const keys = Object.keys(w) as AlgoKey[];
  const numKeys = keys.length || 1;
  const total = keys.reduce((acc, k) => acc + Math.abs(w[k] ?? 0), 0);
  const normalized = { ...w };
  
  if (total <= 0) {
    keys.forEach(k => { normalized[k] = 1.0 / numKeys; });
    return normalized;
  }

  // Bornes dynamiques : min = 10% du poids uniforme, max = 300% du poids uniforme
  const uniformWeight = 1.0 / numKeys;
  const FLOOR = Math.max(1e-6, uniformWeight * 0.10);
  const CEILING = Math.min(0.90, uniformWeight * 3.0);

  keys.forEach((k) => {
    let val = Math.abs(normalized[k]!) / total;
    val = Math.max(FLOOR, Math.min(CEILING, val));
    normalized[k] = parseFloat(val.toFixed(6));
  });

  // Correction du résidu de flottant
  const currentSum = keys.reduce((acc, k) => acc + normalized[k]!, 0);
  if (Math.abs(currentSum - 1.0) > 1e-6) {
    const diff = 1.0 - currentSum;
    normalized[keys[0]] = parseFloat((normalized[keys[0]]! + diff).toFixed(6));
  }

  return normalized;
};

// Fitness via produit matriciel pur avec normalisation statistique dynamique
const evaluateTensor = (w: AlgoWeights, tensors: TensorContext[]): number => {
  let totalHits = 0;
  
  for (const tensor of tensors) {
    const scores: { num: number; score: number }[] = [];
    const allScores: number[] = [];

    // 1. Calcul des scores bruts et collecte pour statistiques
    for (let num = 1; num <= 90; num++) {
      let sum = 0;
      const metrics = tensor.matrix[num];
      const keys = Object.keys(w) as AlgoKey[];
      
      for (const k of keys) {
        const feat = metrics[k] || 0;
        sum += feat * (w[k] || 0);
      }
      allScores.push(sum);
      scores.push({ num, score: sum });
    }

    // 2. Calcul de la médiane et de l'écart-type pour une sigmoïde adaptative (Zéro Nombre Magique)
    const sortedScores = [...allScores].sort((a, b) => a - b);
    const median = sortedScores[Math.floor(sortedScores.length / 2)];
    const mean = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    const variance = allScores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / allScores.length;
    const stdDev = Math.sqrt(variance) || 1e-6;
    const slope = 1.0 / stdDev; // Pente dérivée de la dispersion des données

    // 3. Application de la CDF Logistique centrée sur la médiane
    scores.forEach(s => {
      const zScore = (s.score - median) / stdDev;
      s.score = 100 / (1 + Math.exp(-slope * zScore));
    });

    // 4. Évaluation des hits (Top 5)
    scores.sort((a, b) => b.score !== a.score ? b.score - a.score : a.num - b.num); // Tri déterministe
    const top5 = scores.slice(0, 5).map(s => s.num);
    const top10 = scores.slice(0, 10).map(s => s.num);

    const getGridPos = (val: number) => {
      const row = Math.floor((val - 1) / 10);
      const col = (val - 1) % 10;
      return { row, col };
    };

    let totalContinLoss = 0;
    tensor.targetWinners.forEach((w) => {
      let maxSimForWinner = 1e-9;
      top5.forEach((p) => {
        let sim = 0.0;
        if (p === w) {
          sim = 1.0;
        } else {
          const linSim = Math.exp(-0.25 * Math.abs(p - w));
          const posP = getGridPos(p);
          const posW = getGridPos(w);
          const gridDist = Math.sqrt(Math.pow(posP.row - posW.row, 2) + Math.pow(posP.col - posW.col, 2));
          const gridSim = Math.exp(-0.35 * gridDist);

          let mirrorSim = 0.0;
          if (p + w === 91) mirrorSim = 0.45;
          const strP = p.toString();
          const revP = parseInt(strP.split("").reverse().join(""), 10);
          if (revP >= 1 && revP <= 90 && revP === w) mirrorSim = Math.max(mirrorSim, 0.40);

          let harmonicSim = 0.0;
          if (p % 10 === w % 10) harmonicSim = 0.35;

          let decadeSim = 0.0;
          if (Math.floor((p - 1) / 10) === Math.floor((w - 1) / 10)) decadeSim = 0.25;

          sim = Math.max(linSim, gridSim, mirrorSim, harmonicSim, decadeSim);
        }
        if (sim > maxSimForWinner) maxSimForWinner = sim;
      });
      totalContinLoss += (1.0 - maxSimForWinner);
    });

    const targetSize = tensor.targetWinners.length || 5;
    const match10 = top10.filter(n => tensor.targetWinners.includes(n)).length;

    // Fitness structurelle basée sur la similarité au lieu de booléens purs
    const globalSimilarityScore = targetSize - totalContinLoss; 
    totalHits += (globalSimilarityScore * (targetSize / 2.5)) + match10;
    
    // Récompense exponentielle douce pour les "gros coups" approchés
    if (globalSimilarityScore >= 2.0) {
      totalHits += Math.pow(globalSimilarityScore, 2) * (targetSize / 2.5); 
    }
  }
  
  return totalHits;
};

// Crossover Arithmétique Déterministe
const arithmeticCrossover = (prng: LCG, p1: AlgoWeights, p2: AlgoWeights): AlgoWeights => {
  const child: AlgoWeights = {} as AlgoWeights;
  const keys = Object.keys(p1) as AlgoKey[];
  keys.forEach(k => {
    // Alpha déterministe via LCG
    const alpha = prng.next();
    child[k] = (p1[k] || 0) * alpha + (p2[k] || 0) * (1 - alpha);
  });
  return normalizeWeights(child);
};

// Mutation adaptative pondérée par l'entropie (température)
const mutate = (prng: LCG, w: AlgoWeights, rate: number, entropy: number): AlgoWeights => {
  const mutant = { ...w };
  const keys = Object.keys(w) as AlgoKey[];
  const numKeys = keys.length || 1;
  const uniformWeight = 1.0 / numKeys;
  
  keys.forEach(k => {
    if (prng.next() < rate) {
      // Bruit dynamique proportionnel au chaos (Entropie)
      const noise = (prng.next() - 0.5) * uniformWeight * Math.exp(entropy);
      // Bornes étendues / resserrées selon la structure informationnelle
      mutant[k] = Math.max(uniformWeight * Math.exp(-entropy), Math.min(uniformWeight * Math.exp(entropy), (mutant[k] || 0) + noise));
    }
  });
  return normalizeWeights(mutant);
};

ctx.onmessage = (e) => {
  const { type, payload } = e.data;
  if (type === 'start') {
    const { tensors, baseWeights, config, timeSignature } = payload as { tensors: TensorContext[], baseWeights: AlgoWeights, config: WorkerConfig, timeSignature: string };
    
    // Seed déterministe absolu synchronisé sur la signature temporelle
    const prng = new LCG(`tensor_${timeSignature}_${config.populationSize}`);

    let population: { weights: AlgoWeights, fitness: number }[] = [];
    
    // Initialisation déterministe autour des poids de base
    for (let i = 0; i < config.populationSize; i++) {
      const w = i === 0 ? normalizeWeights(baseWeights) : mutate(prng, baseWeights, config.mutationRate, config.entropy);
      population.push({ weights: w, fitness: evaluateTensor(w, tensors) });
    }
    
    population.sort((a, b) => b.fitness !== a.fitness ? b.fitness - a.fitness : 0); // Tri déterministe

    let bestFitness = population[0].fitness;
    let staleCount = 0;
    
    // Seuil d'arrêt anticipé dérivé de la persistance (loi d'airain de l'assimilation d'information)
    // Plus le système est persistant (Hurst > 0.5), plus on peut arrêter tôt si on sature
    const earlyStopThreshold = Math.ceil(Math.sqrt(config.maxGenerations) * (1.0 + config.entropy));

    for (let gen = 0; gen < config.maxGenerations; gen++) {
      const nextGen: { weights: AlgoWeights, fitness: number }[] = [];
      
      // Élitisme dynamique (La quantité conservée baisse si l'entropie monte, max 10%)
      const eliteCount = Math.max(2, Math.floor(config.populationSize * 0.1 * (1.0 - config.entropy)));
      for(let i = 0; i < eliteCount; i++) {
          nextGen.push({ ...population[i] });
      }

      while (nextGen.length < config.populationSize) {
        // Pression de sélection (Taille du tournoi) inversement proportionnelle à l'entropie
        const tournamentSize = Math.max(2, Math.floor(2.0 + (3.0 * (1.0 - config.entropy))));
        let bestIdx = 0;
        let bestFit = -Infinity;
        
        for (let t = 0; t < tournamentSize; t++) {
          const idx = Math.floor(prng.next() * (config.populationSize / 2));
          if (population[idx].fitness > bestFit) {
            bestFit = population[idx].fitness;
            bestIdx = idx;
          }
        }
        
        const p1 = population[bestIdx];
        
        let bestIdx2 = 0;
        let bestFit2 = -Infinity;
        for (let t = 0; t < tournamentSize; t++) {
          const idx = Math.floor(prng.next() * (config.populationSize / 2));
          if (population[idx].fitness > bestFit2) {
            bestFit2 = population[idx].fitness;
            bestIdx2 = idx;
          }
        }
        const p2 = population[bestIdx2];

        const child = arithmeticCrossover(prng, p1.weights, p2.weights);
        const mutant = mutate(prng, child, config.mutationRate, config.entropy);
        nextGen.push({ weights: mutant, fitness: evaluateTensor(mutant, tensors) });
      }

      population = nextGen;
      population.sort((a, b) => b.fitness !== a.fitness ? b.fitness - a.fitness : 0);

      if (population[0].fitness > bestFitness) {
        bestFitness = population[0].fitness;
        staleCount = 0;
      } else {
        staleCount++;
      }

      ctx.postMessage({
        type: 'progress',
        data: {
          gen: gen + 1,
          bestFitness: population[0].fitness,
          bestGenome: population[0].weights
        }
      });

      if (staleCount > earlyStopThreshold) break;
    }

    ctx.postMessage({
      type: 'result',
      data: {
        bestWeights: population[0].weights,
        fitness: population[0].fitness
      }
    });
  }
};

