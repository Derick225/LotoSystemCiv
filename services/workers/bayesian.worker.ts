import { AlgoWeights, AlgoKey } from '../../shared/prediction.types';
import { LCG } from '../../utils/mathUtils';

export {};

interface TensorContext {
  drawId: string;
  targetWinners: number[];
  topologicalProximity?: Record<number, number>;
  matrix: Record<number, Record<AlgoKey, number>>;
}

interface BayesianWorkerConfig {
    initialSamples: number;
    bayesianIterations: number;
    gamma: number;
    historyDepth: number;
}

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

  const FLOOR = 1.0 / (2.0 * numKeys);
  const CEILING = 2.0 / Math.sqrt(numKeys);

  keys.forEach((k) => {
    let val = Math.abs(normalized[k]!) / total;
    val = Math.max(FLOOR, Math.min(CEILING, val));
    normalized[k] = parseFloat(val.toFixed(6));
  });

  const currentSum = keys.reduce((acc, k) => acc + normalized[k]!, 0);
  if (Math.abs(currentSum - 1.0) > 1e-6) {
    const diff = 1.0 - currentSum;
    normalized[keys[0]] = parseFloat((normalized[keys[0]]! + diff).toFixed(6));
  }
  return normalized;
};

// Évaluation tensorielle déterministe (micro-secondes)
const evaluateTensor = (w: AlgoWeights, tensors: TensorContext[]): number => {
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
        sum += (metrics[k as AlgoKey] || 0) * (w[k as AlgoKey] || 0);
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
    const globalSimilarityScore = targetSize - totalContinLoss; 

    let top10Energy = 0;
    if (tensor.topologicalProximity) {
        top10.forEach((p, idx) => {
            const prox = tensor.topologicalProximity![p] || 0;
            const rankWeight = Math.exp(-0.2 * idx); 
            top10Energy += Math.tanh(prox * rankWeight);
        });
    } else {
        tensor.targetWinners.forEach(w => {
          let nodeEnergy = 0;
          top10.forEach((p, idx) => {
            const rankWeight = Math.exp(-0.2 * idx); 
            const proximity = Math.exp(-0.15 * Math.abs(p - w));
            nodeEnergy += proximity * rankWeight;
          });
          top10Energy += Math.tanh(nodeEnergy);
        });
    }

    const baseReward = globalSimilarityScore * (targetSize / 2.5) + top10Energy;
    const exponentialBonus = Math.pow(globalSimilarityScore, 2.0) * (targetSize / 2.5);
    totalHits += baseReward + exponentialBonus;
  }
  return totalHits;
};

class MultivariateGaussianKDE {
    private keys: string[];
    private points: Record<string, number>[];
    private d: number;
    private mean: Float64Array;
    private L: Float64Array[]; 
    private logDetH: number; 
    private piTerm: number; 

    constructor(keys: string[], dataset: Record<string, number>[]) {
        this.keys = keys;
        this.points = dataset;
        this.d = keys.length;
        
        this.mean = new Float64Array(this.d);
        for (let i = 0; i < this.d; i++) {
            let sum = 0;
            for (const pt of dataset) {
                sum += pt[this.keys[i]] || 0;
            }
            this.mean[i] = sum / dataset.length;
        }

        const cov = Array.from({ length: this.d }, () => new Float64Array(this.d));
        for (let i = 0; i < this.d; i++) {
            for (let j = 0; j < this.d; j++) {
                let sum = 0;
                for (const pt of dataset) {
                    const devI = (pt[this.keys[i]] || 0) - this.mean[i];
                    const devJ = (pt[this.keys[j]] || 0) - this.mean[j];
                    sum += devI * devJ;
                }
                cov[i][j] = sum / Math.max(1, dataset.length - 1);
            }
        }

        let diagSum = 0;
        for (let i = 0; i < this.d; i++) {
            diagSum += cov[i][i];
        }
        const avgVar = diagSum / this.d;
        const lambda = Math.max(1e-5, (1.0 / (this.d + 1.0)) * avgVar);
        for (let i = 0; i < this.d; i++) {
            cov[i][i] += lambda;
        }

        const n = dataset.length;
        const hScaling = Math.pow(n, -2 / (this.d + 4));
        const H = Array.from({ length: this.d }, () => new Float64Array(this.d));
        for (let i = 0; i < this.d; i++) {
            for (let j = 0; j < this.d; j++) {
                H[i][j] = hScaling * cov[i][j];
            }
        }

        this.L = Array.from({ length: this.d }, () => new Float64Array(this.d));
        for (let i = 0; i < this.d; i++) {
            for (let j = 0; j <= i; j++) {
                let sum = 0;
                for (let k = 0; k < j; k++) {
                    sum += this.L[i][k] * this.L[j][k];
                }

                if (i === j) {
                    this.L[i][j] = Math.sqrt(Math.max(1e-9, H[i][i] - sum));
                } else {
                    this.L[i][j] = (H[i][j] - sum) / this.L[j][j];
                }
            }
        }

        let logLiiSum = 0;
        for (let i = 0; i < this.d; i++) {
            logLiiSum += Math.log(this.L[i][i]);
        }
        this.logDetH = 2 * logLiiSum;
        this.piTerm = -(this.d / 2) * Math.log(2 * Math.PI);
    }

    public evaluate(x: Record<string, number>): number {
        let densitySum = 0;
        const n = this.points.length;

        for (const pt of this.points) {
            const y = new Float64Array(this.d);
            for (let i = 0; i < this.d; i++) {
                y[i] = (x[this.keys[i]] || 0) - (pt[this.keys[i]] || 0);
            }

            const w = new Float64Array(this.d);
            for (let i = 0; i < this.d; i++) {
                let sum = 0;
                for (let j = 0; j < i; j++) {
                    sum += this.L[i][j] * w[j];
                }
                w[i] = (y[i] - sum) / this.L[i][i];
            }

            let mahalanobisSq = 0;
            for (let i = 0; i < this.d; i++) {
                mahalanobisSq += w[i] * w[i];
            }

            const logDensity = this.piTerm - 0.5 * this.logDetH - 0.5 * mahalanobisSq;
            densitySum += Math.exp(logDensity);
        }

        return Math.max(1e-15, densitySum / n);
    }

    public sample(prng: LCG): Record<string, number> {
        const idx = Math.floor(prng.next() * this.points.length);
        const center = this.points[idx];

        const z = new Float64Array(this.d);
        for (let i = 0; i < this.d; i += 2) {
            const [z0, z1] = this.boxMullerPair(prng);
            z[i] = z0;
            if (i + 1 < this.d) {
                z[i + 1] = z1;
            }
        }

        const sample: Record<string, number> = {};
        for (let i = 0; i < this.d; i++) {
            let offset = 0;
            for (let j = 0; j <= i; j++) {
                offset += this.L[i][j] * z[j];
            }
            sample[this.keys[i]] = Math.max(0, Math.min(1, (center[this.keys[i]] || 0) + offset));
        }

        return sample;
    }

    private boxMullerPair(prng: LCG): [number, number] {
        let u = 0, v = 0;
        while (u === 0) u = prng.next();
        while (v === 0) v = prng.next();
        const r = Math.sqrt(-2.0 * Math.log(u));
        const theta = 2.0 * Math.PI * v;
        return [r * Math.cos(theta), r * Math.sin(theta)];
    }
}

const ctx = self as unknown as Worker;

ctx.onmessage = async (e) => {
    try {
        const { type, payload } = e.data;
        
        if (type === 'start') {
            const { tensors, currentWeights, config, memoryObservations, timeSignature } = payload as {
                tensors: TensorContext[];
                currentWeights: AlgoWeights;
                config: BayesianWorkerConfig;
                memoryObservations?: { weights: AlgoWeights; score: number }[];
                timeSignature: string;
            };
            
            const prng = new LCG(`bayesian_${timeSignature}_${config.initialSamples}`);
            const typedConfig = config as BayesianWorkerConfig;
            const keys = Object.values(AlgoKey).filter(k => currentWeights[k as AlgoKey] !== undefined);
            
            let progressCount = 0;
            const totalSteps = typedConfig.initialSamples + typedConfig.bayesianIterations;
            
            // Calcul du score de base déterministe via la méthode d'évaluation tensorielle rapide
            const baselineScore = evaluateTensor(currentWeights, tensors);
            
            const updateProgress = (best: number) => {
                progressCount++;
                ctx.postMessage({ type: 'progress', data: { gen: progressCount, progress: Math.round((progressCount / totalSteps) * 100), bestScore: best }});
            };

            // Normalisation à chaud des observations mémoire par rapport aux tenseurs actuels
            const observations: { weights: AlgoWeights; score: number }[] = memoryObservations 
                ? memoryObservations.map(o => ({
                    weights: o.weights,
                    score: evaluateTensor(o.weights, tensors)
                }))
                : [];
            
            const remainingInitialSamples = Math.max(0, typedConfig.initialSamples - observations.length);
            for (let i = 0; i < remainingInitialSamples; i++) {
                const randomWeights: AlgoWeights = {} as AlgoWeights;
                for (const key of keys) {
                    const weight = currentWeights[key as AlgoKey] || 0;
                    const replaceFactor = prng.next();
                    const scaleFactor = Math.cos(prng.next() * Math.PI / 2.0);
                    
                    randomWeights[key as AlgoKey] = (weight * scaleFactor) * (1 - replaceFactor) + prng.next() * replaceFactor;
                }
                
                const normWeights = normalizeWeights(randomWeights);
                const score = evaluateTensor(normWeights, tensors);
                observations.push({ weights: normWeights, score });
                
                const currentBest = Math.max(...observations.map(o => o.score), baselineScore);
                updateProgress(currentBest);
            }

            for (let i = 0; i < typedConfig.bayesianIterations; i++) {
                observations.sort((a, b) => b.score - a.score);
                
                const splitIndex = Math.max(2, Math.floor(observations.length * typedConfig.gamma));
                const goodObs = observations.slice(0, splitIndex);
                const badObs = observations.slice(splitIndex);

                const goodKDE = new MultivariateGaussianKDE(keys as string[], goodObs.map(o => o.weights as Record<string, number>));
                const badKDE = new MultivariateGaussianKDE(keys as string[], badObs.map(o => o.weights as Record<string, number>));

                let bestCandidate: AlgoWeights | null = null;
                let maxRatio = -Infinity;
                
                for (let c = 0; c < 20; c++) {
                    const cand = goodKDE.sample(prng) as AlgoWeights;
                    
                    const l_x = goodKDE.evaluate(cand as any);
                    const g_x = badKDE.evaluate(cand as any);
                    
                    const ratioScore = Math.log((l_x + 1e-12) / (g_x + 1e-12));
                    
                    if (ratioScore > maxRatio) {
                        maxRatio = ratioScore;
                        bestCandidate = cand;
                    }
                }

                if (bestCandidate) {
                    const normCandidate = normalizeWeights(bestCandidate);
                    const score = evaluateTensor(normCandidate, tensors);
                    observations.push({ weights: normCandidate, score });
                }
                
                const currentBest = Math.max(...observations.map(o => o.score), baselineScore);
                updateProgress(currentBest);
            }

            observations.sort((a, b) => b.score - a.score);
            const bestObs = observations[0];
            const improvement = bestObs.score - baselineScore;

            ctx.postMessage({
                type: 'result',
                data: {
                    bestWeights: improvement > 0 ? bestObs.weights : currentWeights,
                    improvement,
                    finalScore: Math.max(bestObs.score, baselineScore),
                    iterations: totalSteps,
                    observations
                }
            });
        }
    } catch (e: unknown) {
        ctx.postMessage({ type: 'error', message: (e instanceof Error ? e.message : String(e)) || 'Worker error' });
    }
};
