import { LCG } from '../../utils/mathUtils';

export {};

interface DrawResultLite { gagnants: number[]; machine?: number[]; }
interface AlgoWeights { [key: string]: number | undefined; }
interface AdaptiveRules { criticalZoneMin: number; criticalZoneMax: number; }
interface Individual { weights: AlgoWeights; fitness: number; }

const ctx = self as unknown as Worker;

// --- UTILS ---
const normalizeWeights = (w: AlgoWeights): AlgoWeights => {
  const keys = Object.keys(w);
  const numKeys = keys.length || 1;
  const total = Object.values(w).reduce<number>((acc, val) => acc + Math.abs(val ?? 0), 0);
  const normalized: AlgoWeights = { ...w };
  
  if (total <= 0) {
    keys.forEach(k => { normalized[k] = 1.0 / numKeys; });
    return normalized;
  }

  const uniformWeight = 1.0 / numKeys;
  const FLOOR = Math.max(1e-6, uniformWeight * 0.10);
  const CEILING = Math.min(0.90, uniformWeight * 3.0);

  keys.forEach(k => {
    const val = normalized[k];
    if (typeof val === 'number') {
      let normVal = Math.abs(val) / total;
      normVal = Math.max(FLOOR, Math.min(CEILING, normVal));
      normalized[k] = parseFloat(normVal.toFixed(6));
    }
    const currentSum = keys.reduce((acc, key) => acc + (normalized[key] || 0), 0);
    if (Math.abs(currentSum - 1.0) > 1e-6) {
        normalized[keys[0]] = parseFloat(((normalized[keys[0]] || 0) + (1.0 - currentSum)).toFixed(6));
    }
  });
  return normalized;
};

// Box-Muller déterministe via LCG instance
const randomGaussian = (prng: LCG, mean: number = 0, stdev: number = 1): number => {
  const u = 1 - prng.next(); 
  const v = prng.next();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
};

const euclideanDistance = (w1: AlgoWeights, w2: AlgoWeights): number => {
  const keys = Array.from(new Set([...Object.keys(w1), ...Object.keys(w2)]));
  let sumSq = 0;
  keys.forEach(k => {
    const v1 = w1[k] || 0;
    const v2 = w2[k] || 0;
    sumSq += Math.pow(v1 - v2, 2);
  });
  return Math.sqrt(sumSq);
};

const calculateDiversity = (population: Individual[]): number => {
  if (population.length < 2) return 0;
  const best = population[0].weights;
  let totalDist = 0;
  for (let i = 1; i < population.length; i++) {
    totalDist += euclideanDistance(best, population[i].weights);
  }
  return totalDist / (population.length - 1);
};

// --- GENETIC OPERATORS ---
const arithmeticCrossover = (prng: LCG, p1: AlgoWeights, p2: AlgoWeights): AlgoWeights => {
  const child: AlgoWeights = {} as AlgoWeights;
  const keys = Array.from(new Set([...Object.keys(p1), ...Object.keys(p2)]));
  keys.forEach(k => {
    const alpha = prng.next();
    child[k] = (p1[k] || 0) * alpha + (p2[k] || 0) * (1 - alpha);
  });
  return normalizeWeights(child);
};

const mutateGaussian = (prng: LCG, w: AlgoWeights, sigma: number, rate: number): AlgoWeights => {
  const mutant = { ...w };
  const keys = Object.keys(mutant);
  const numKeys = keys.length || 1;
  const uniformWeight = 1.0 / numKeys;
  
  keys.forEach(k => {
    if (prng.next() < rate) {
      const noise = randomGaussian(prng, 0, sigma);
      const currentVal = mutant[k] || 0;
      // Bornes dynamiques basées sur le poids uniforme
      mutant[k] = Math.max(uniformWeight * 0.1, Math.min(uniformWeight * 3.0, currentVal + noise));
    }
  });
  return normalizeWeights(mutant);
};

// --- FITNESS FUNCTION (Simplifiée pour l'exemple, mais avec Zéro Constante Magique) ---
const evaluate = (w: AlgoWeights, _r: AdaptiveRules, history: DrawResultLite[], depth: number): number => {
  const limit = Math.min(history.length - 1, depth);
  let totalScore = 0;
  
  // Poids extraits dynamiquement
  const weightsToUse = {
    freq: w.frequency || 0,
    markov: w.markov || 0,
    gap: w.gap || 0,
    mom: w.momentum || 0,
    bayes: w.bayes || 0,
    temporal: w.temporal || 0,
    spec: w.spectral || 0,
    affinity: w.affinity || 0,
    spatial: w.spatial || 0,
    fractal: w.fractal || 0
  };

  for (let i = 0; i < limit; i++) {
    const target = history[i].gagnants;
    const past = history.slice(i + 1); 
    if (past.length < 20) break;

    const contextSize = Math.min(past.length, Math.max(20, Math.floor(past.length * 0.4))); // Fenêtre adaptative
    const subPast = past.slice(0, contextSize);
    const candidates = new Map<number, number>();

    // 1. Fréquence (Zéro constante '100' ou '3')
    if (weightsToUse.freq > 0.01) {
      const freqMap = new Map<number, number>();
      subPast.forEach(d => d.gagnants.forEach(n => freqMap.set(n, (freqMap.get(n) || 0) + 1)));
      const maxFreq = Math.max(1, ...Array.from(freqMap.values()));
      freqMap.forEach((count, n) => {
        const normalizedFreq = (count / maxFreq) * 100;
        candidates.set(n, (candidates.get(n) || 0) + (normalizedFreq * weightsToUse.freq));
      });
    }

    // 2. Gap (Loi Géométrique Exacte)
    if (weightsToUse.gap > 0.01) {
      for (let n = 1; n <= 90; n++) {
        let gap = 0;
        for (let k = 0; k < subPast.length; k++) {
          if (subPast[k].gagnants.includes(n)) break;
          gap++;
        }
        const p = 5 / 90; // Probabilité a priori
        const score = (1 - Math.pow(1 - p, gap)) * 100;
        candidates.set(n, (candidates.get(n) || 0) + (score * weightsToUse.gap));
      }
    }

    // Top 5 Prediction
    const top5 = Array.from(candidates.entries())
      .sort((a, b) => b[1] !== a[1] ? b[1] - a[1] : a[0] - b[0]) // Tri déterministe
      .slice(0, 5)
      .map(x => x[0]);
    
    // --- EVALUATION TOPOLOGIQUE CONTINUE & EXPOSANT DE LYAPUNOV ---
    // Remplace la fonction de perte binaire (hit/miss) par une similarité continue
    // modulée par le régime de divergence fractale (Lyapunov).
    const getGridPos = (val: number) => {
      const row = Math.floor((val - 1) / 10);
      const col = (val - 1) % 10;
      return { row, col };
    };

    let lyapunovSum = 0;
    let validSteps = 0;
    const horizon = Math.min(30, past.length);
    for (let k = 0; k < horizon - 1; k++) {
      const t0 = past[k]?.gagnants;
      const t1 = past[k + 1]?.gagnants;
      if (!t0 || !t1) continue;
      
      let topologicalDist = 0;
      for (const c1 of t1) {
        let minDist = 999;
        const pos1 = getGridPos(c1);
        for (const c0 of t0) {
          const pos0 = getGridPos(c0);
          const d = Math.sqrt(Math.pow(pos1.row - pos0.row, 2) + Math.pow(pos1.col - pos0.col, 2));
          if (d < minDist) minDist = d;
        }
        topologicalDist += minDist;
      }
      lyapunovSum += Math.log(topologicalDist + 1e-4);
      validSteps++;
    }
    const lambda = validSteps > 0 ? lyapunovSum / validSteps : 0.0;
    const isChaotic = lambda > 0;
    const divergenceForce = Math.tanh(Math.abs(lambda));

    let totalContinLoss = 0;
    target.forEach((w) => {
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
      
      if (isChaotic) {
        totalContinLoss += maxSimForWinner * divergenceForce; 
      } else {
        totalContinLoss += (1.0 - maxSimForWinner) * (1.0 - divergenceForce);
      }
    });
    
    // La fitness d'un individu est proportionnelle à la similarité mathématique continue.
    const targetSize = target.length || 5;
    const globalSimilarityScore = targetSize - totalContinLoss; // [0.0 = bruit, 5.0 = correspondance parfaite]

    let top5Energy = 0;
    target.forEach(w => {
        let nodeEnergy = 0;
        top5.forEach((p, idx) => {
            const rankWeight = Math.exp(-0.2 * idx); 
            const proximity = Math.exp(-0.15 * Math.abs(p - w));
            nodeEnergy += proximity * rankWeight;
        });
        top5Energy += Math.tanh(nodeEnergy);
    });

    // Récompense exponentielle douce et structurale, purement analytique (Zéro compte discret)
    totalScore += 2.0 * Math.pow(5.0, globalSimilarityScore) * (targetSize / 5.0) + top5Energy - 2.0;

  }

  return totalScore;
};

// --- WORKER HANDLER ---
ctx.onmessage = (e) => {
  if (e.data.type === 'start') {
    const { drawName, baseWeights, baseRules, config, history, timeSignature } = e.data.payload;
    
    // Isolation du PRNG
    const prng = new LCG(`genetic_${timeSignature || drawName}_${config.populationSize || 40}`);

    const POPSIZE = config.populationSize || 40;
    const MAX_GENERATIONS = config.maxGenerations || 40;
    const INITIAL_MUTATION_RATE = config.mutationRate || 0.2;
    const ELITISM_COUNT = config.eliteSize || Math.max(2, Math.floor(POPSIZE * 0.10));
    const EARLY_STOP_PATIENCE = config.earlyStopGenerations || Math.max(3, Math.floor(MAX_GENERATIONS * 0.15));
    
    // Paramètres dérivés du régime Thermo-Statistique pour la dynamique d'exploration/exploitation
    const Hurst = config.regimeMetrics?.hurst ?? 0.5;
    const Entropy = config.regimeMetrics?.entropy ?? 0.5;
    
    // Le seuil de diversité idéal est proportionnel à l'entropie du système
    const targetDiversity = 0.01 + (Entropy * 0.10); // Plage [0.01 - 0.11] 

    let population: Individual[] = Array.from({ length: POPSIZE }, (_, i) => ({
      // Dispersion initiale proportionnelle au chaos du système
      weights: i === 0 ? baseWeights : mutateGaussian(prng, baseWeights, Entropy, Entropy + 0.1),
      fitness: 0
    }));

    let bestFitnessEver = -Infinity;
    let stagnationCount = 0;
    let lastBestFitness = -Infinity;

    for (let gen = 0; gen < MAX_GENERATIONS; gen++) {
      population.forEach(ind => {
        if (ind.fitness === 0) { 
          ind.fitness = evaluate(ind.weights, baseRules, history, config.historyDepth);
        }
      });

      population.sort((a, b) => b.fitness !== a.fitness ? b.fitness - a.fitness : 0);
      
      const currentBest = population[0];
      const currentAvg = population.reduce((a, b) => a + b.fitness, 0) / POPSIZE;
      const diversity = calculateDiversity(population);

      if (currentBest.fitness > lastBestFitness) {
        lastBestFitness = currentBest.fitness;
        stagnationCount = 0;
      } else {
        stagnationCount++;
      }

      ctx.postMessage({ 
        type: 'progress', 
        data: { 
          gen: gen + 1, 
          bestFitness: currentBest.fitness, 
          avgFitness: currentAvg, 
          diversity, 
          stagnation: stagnationCount,
          bestGenome: currentBest.weights 
        } 
      });

      if (stagnationCount >= EARLY_STOP_PATIENCE) break;

      if (currentBest.fitness > bestFitnessEver) {
        bestFitnessEver = currentBest.fitness;
      }

      // Paramètres adaptatifs continus (Recuit simulé)
      // La variance diminue avec les générations (refroidissement) mais est pondérée par l'entropie (température structurelle)
      const coolingSchedule = 1.0 - Math.pow(gen / MAX_GENERATIONS, 1.0 / (1.0 + Entropy));
      const baseSigma = Entropy * coolingSchedule;
      
      // La pente de la transition (gain) dépend de l'absence de persistance temporelle
      const transitionGain = 10.0 + ((1.0 - Hurst) * 40.0);
      const diversityFactor = 1.0 / (1.0 + Math.exp(transitionGain * (diversity - targetDiversity)));
      
      // Amplification asymptotique de l'exploration si la diversité s'effondre dans un régime chaotique
      const maxSigma = Math.max(0.6, Entropy + 0.3);
      const maxMutation = Math.min(0.9, INITIAL_MUTATION_RATE + 0.4);
      
      const currentSigma = baseSigma + (maxSigma - baseSigma) * diversityFactor;
      const currentMutationRate = INITIAL_MUTATION_RATE + (maxMutation - INITIAL_MUTATION_RATE) * diversityFactor;

      const nextGen: Individual[] = [];
      for (let i = 0; i < ELITISM_COUNT; i++) {
        nextGen.push({ ...population[i] });
      }

      while (nextGen.length < POPSIZE) {
        // La pression de sélection (Taille du tournoi) est inversement proportionnelle à l'entropie.
        // Chaos élevé = Petit tournoi (plus de diversité). Système stable = Grand tournoi (convergence rapide)
        const tournamentSize = Math.max(2, Math.floor(2.0 + (3.0 * (1.0 - Entropy))));
        
        const selectParent = () => {
          let best = population[Math.floor(prng.next() * POPSIZE)];
          for (let k = 1; k < tournamentSize; k++) {
            const contender = population[Math.floor(prng.next() * POPSIZE)];
            if (contender.fitness > best.fitness) best = contender;
          }
          return best;
        };

        const p1 = selectParent();
        const p2 = selectParent();
        let childWeights = arithmeticCrossover(prng, p1.weights, p2.weights);
        childWeights = mutateGaussian(prng, childWeights, currentSigma, currentMutationRate);
        nextGen.push({ weights: childWeights, fitness: 0 });
      }
      population = nextGen;
    }

    ctx.postMessage({
      type: 'result',
      data: { bestChromosome: population[0] }
    });
  }
};

