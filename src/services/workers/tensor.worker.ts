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

// Table géométrique pré-calculée pour 1..90 (Zéro allocation en boucle chaude)
const GEO_TABLE = Array.from({ length: 91 }, (_, num) => {
  if (num === 0) return { row: 0, col: 0, rev: -1, mod10: -1, decade: -1 };
  const row = Math.floor((num - 1) / 10);
  const col = (num - 1) % 10;
  const rev = num < 10 ? num : (num % 10) * 10 + Math.floor(num / 10);
  return {
    row,
    col,
    rev: rev >= 1 && rev <= 90 ? rev : -1,
    mod10: num % 10,
    decade: row,
  };
});

// Fitness via produit matriciel pur avec normalisation statistique dynamique
const evaluateTensor = (w: AlgoWeights, tensors: TensorContext[]): number => {
  let totalHits = 0;
  const keys = Object.keys(w) as AlgoKey[];
  const numKeys = keys.length;
  const activeWeights: number[] = new Array(numKeys);
  for (let k = 0; k < numKeys; k++) {
    activeWeights[k] = w[keys[k]] || 0;
  }
  
  for (const tensor of tensors) {
    const scores: { num: number; score: number }[] = new Array(90);
    const allScores: number[] = new Array(90);

    // 1. Calcul des scores bruts et collecte pour statistiques (sans allocations répétées)
    for (let num = 1; num <= 90; num++) {
      let sum = 0;
      const metrics = tensor.matrix[num];
      
      for (let k = 0; k < numKeys; k++) {
        const feat = metrics ? (metrics[keys[k]] || 0) : 0;
        sum += feat * activeWeights[k];
      }
      allScores[num - 1] = sum;
      scores[num - 1] = { num, score: sum };
    }

    // 2. Calcul de la médiane et de l'écart-type pour une sigmoïde adaptative (Zéro Nombre Magique)
    const sortedScores = [...allScores].sort((a, b) => a - b);
    const median = sortedScores[Math.floor(sortedScores.length / 2)];
    const mean = allScores.reduce((a, b) => a + b, 0) / 90;
    const variance = allScores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 90;
    const stdDev = Math.sqrt(variance) || 1e-6;
    const slope = 1.0 / stdDev; // Pente dérivée de la dispersion des données

    // 3. Application de la CDF Logistique centrée sur la médiane
    for (let i = 0; i < 90; i++) {
      const zScore = (scores[i].score - median) / stdDev;
      scores[i].score = 100 / (1 + Math.exp(-slope * zScore));
    }

    // 4. Évaluation des hits (Top 5 & Top 10)
    scores.sort((a, b) => b.score !== a.score ? b.score - a.score : a.num - b.num); // Tri déterministe
    const top5 = [scores[0].num, scores[1].num, scores[2].num, scores[3].num, scores[4].num];
    const top10 = scores.slice(0, 10).map(s => s.num);

    let totalContinLoss = 0;
    const targetWinners = tensor.targetWinners;
    const targetLen = targetWinners.length;

    for (let i = 0; i < targetLen; i++) {
      const wNum = targetWinners[i];
      let maxSimForWinner = 1e-9;
      const geoW = (wNum >= 1 && wNum <= 90) ? GEO_TABLE[wNum] : { row: 0, col: 0, rev: -1, mod10: -1, decade: -1 };

      for (let j = 0; j < 5; j++) {
        const p = top5[j];
        if (p === wNum) {
          maxSimForWinner = 1.0;
          break;
        }

        const geoP = (p >= 1 && p <= 90) ? GEO_TABLE[p] : { row: 0, col: 0, rev: -1, mod10: -1, decade: -1 };
        const linSim = Math.exp(-0.25 * Math.abs(p - wNum));
        const gridDist = Math.sqrt(Math.pow(geoP.row - geoW.row, 2) + Math.pow(geoP.col - geoW.col, 2));
        const gridSim = Math.exp(-0.35 * gridDist);

        let mirrorSim = 0.0;
        if (p + wNum === 91) mirrorSim = 0.45;
        if (geoP.rev >= 1 && geoP.rev <= 90 && geoP.rev === wNum) mirrorSim = Math.max(mirrorSim, 0.40);

        let harmonicSim = (geoP.mod10 === geoW.mod10) ? 0.35 : 0.0;
        let decadeSim = (geoP.decade === geoW.decade) ? 0.25 : 0.0;

        const sim = Math.max(linSim, gridSim, mirrorSim, harmonicSim, decadeSim);
        if (sim > maxSimForWinner) maxSimForWinner = sim;
      }
      totalContinLoss += (1.0 - maxSimForWinner);
    }

    const targetSize = targetLen || 5;
    const match10 = top10.filter(n => targetWinners.includes(n)).length;

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

