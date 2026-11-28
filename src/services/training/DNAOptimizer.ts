import { AlgoKey, AlgoWeights } from "../../types";
import { DNA_LEARNING_CALIBRATION } from "../prediction/calibrationConstants";

export interface DNAProfile {
  algoKeys: AlgoKey[];
  medianVector: Float32Array;
  varianceVector: Float32Array;
  entropy: number;
  hurstExponent: number; // Indicateur de persistance (H > 0.5) ou de réversion (H < 0.5)
}

export interface DNACandidate {
  numbers: number[];
  dnaMatrix: Float32Array[]; // K=5 vecteurs (un par numéro)
  synergyVector: Float32Array; // Vecteur agrégé représentant le tirage entier
  distance: number;
  diversityScore: number;
}

export interface XAPExplanation {
  number: number;
  dominantAlgo: AlgoKey;
  contributionPercentage: number;
  dnaVector: Record<AlgoKey, number>;
  compositionEntropy?: number;       // Concentration de la prédiction (normalisée entre 0 et 1)
  compositionGini?: number;          // Indice d'inégalité des contributions (0 = équitable, 1 = concentré)
  synergyAlgos?: AlgoKey[];          // Les algorithmes co-contributeurs significatifs
  shapleyValues?: Record<AlgoKey, number>; // Valeur de Shapley (contribution marginale exacte)
}

export class DNAOptimizer {
  private readonly numAlgos: number;
  private readonly algoKeys: AlgoKey[];

  // Cache instance states to prevent redundant heavy computations
  private lastHistoryRef: any = null;
  private targetDftCached: {
    T_re: Float32Array;
    T_im: Float32Array;
    magT: Float32Array;
  } | null = null;

  private lastLyapunovHistoryRef: any = null;
  private lyapunovExponentCached: {
    lambda: number;
    isChaotic: boolean;
    divergenceForce: number;
  } | null = null;

  // Static trigonometric lookup tables for DFT optimization (Zero-magic, fully deterministic)
  private static cosTable: Float32Array | null = null;
  private static sinTable: Float32Array | null = null;

  constructor(availableAlgos: AlgoKey[]) {
    this.algoKeys = availableAlgos;
    this.numAlgos = availableAlgos.length;
  }

  // --- TRIGONOMETRIC LOOKUP TABLE INITIALIZATION ---

  private static initTrigTables(): void {
    if (this.cosTable && this.sinTable) return;
    const N = 90;
    const limit = Math.floor(N / 2);
    this.cosTable = new Float32Array((limit + 1) * N);
    this.sinTable = new Float32Array((limit + 1) * N);
    for (let u = 0; u <= limit; u++) {
      for (let n = 0; n < N; n++) {
        const angle = (2.0 * Math.PI * u * n) / N;
        this.cosTable[u * N + n] = Math.cos(angle);
        this.sinTable[u * N + n] = Math.sin(angle);
      }
    }
  }

  // --- MATHEMATICAL UTILITIES & ZERO-ALLOCATION ALGORITHMS ---

  private l2Norm(vec: Float32Array): number {
    let sumSq = 0;
    for (let i = 0; i < this.numAlgos; i++) {
      sumSq += vec[i] * vec[i];
    }
    return Math.sqrt(sumSq) || Number.EPSILON;
  }

  private cosineSimilarity(v1: Float32Array, v2: Float32Array): number {
    let dotProduct = 0;
    for (let i = 0; i < this.numAlgos; i++) {
      dotProduct += v1[i] * v2[i];
    }
    return dotProduct / (this.l2Norm(v1) * this.l2Norm(v2));
  }

  private cosineDistance(v1: Float32Array, v2: Float32Array): number {
    return 1.0 - this.cosineSimilarity(v1, v2);
  }

  public getNumAlgos(): number {
    return this.numAlgos;
  }

  public getAlgoKeys(): AlgoKey[] {
    return this.algoKeys;
  }

  public calculateCosineDistance(v1: Float32Array, v2: Float32Array): number {
    return this.cosineDistance(v1, v2);
  }

  /**
   * Probability L1 normalization helper (reused for density sum checks)
   */
  private normalizeProbability(vec: Float32Array): Float32Array {
    const sum =
      vec.reduce((acc, val) => acc + Math.max(0, val), 0) || Number.EPSILON;
    const normalized = new Float32Array(this.numAlgos);
    for (let i = 0; i < this.numAlgos; i++) {
      normalized[i] = Math.max(Number.EPSILON, vec[i]) / sum;
    }
    return normalized;
  }

  /**
   * Kullback-Leibler Divergence calculated with zero dynamic Float32Array heap allocations.
   * This completely avoids Garbage Collector (GC) thrashing inside optimization runs.
   */
  private klDivergence(P: Float32Array, Q: Float32Array): number {
    let sumP = 0;
    let sumQ = 0;
    for (let i = 0; i < this.numAlgos; i++) {
      sumP += Math.max(0, P[i]);
      sumQ += Math.max(0, Q[i]);
    }
    if (sumP === 0) sumP = Number.EPSILON;
    if (sumQ === 0) sumQ = Number.EPSILON;

    let divergence = 0;
    for (let i = 0; i < this.numAlgos; i++) {
      const p = Math.max(Number.EPSILON, P[i]) / sumP;
      const q = Math.max(Number.EPSILON, Q[i]) / sumQ;
      divergence += p * Math.log2(p / q);
    }
    return divergence;
  }

  /**
   * Shannon Entropy calculated with zero dynamic Float32Array heap allocations.
   */
  private calculateShannonEntropyNormalized(probVec: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < this.numAlgos; i++) {
      sum += Math.max(0, probVec[i]);
    }
    if (sum === 0) sum = Number.EPSILON;

    let entropy = 0;
    for (let i = 0; i < this.numAlgos; i++) {
      const p = Math.max(Number.EPSILON, probVec[i]) / sum;
      entropy -= p * Math.log2(p);
    }
    const maxEntropy = Math.log2(this.numAlgos) || Number.EPSILON;
    return entropy / maxEntropy; // Bound to [0, 1]
  }

  /**
   * Linear Congruential Generator (LCG) with canonical seed.
   * Ensures 100% stable, reproducible, deterministic pseudo-random sequences.
   * (Strictly respects "ZERO HASARD / 100% DETERMINISTE" directives)
   */
  public createDeterministicLCG(seed: number): () => number {
    let currentSeed = seed;
    return () => {
      currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296;
      return currentSeed / 4294967296;
    };
  }

  /**
   * Deterministic math-based Hurst Exponent (H) via rescaled range (R/S) methodology.
   */
  private calculateHurstExponent(signals: number[]): number {
    const N = signals.length;
    // Deterministic Continuous Fallback: if insufficient history, neutrally assign 0.5 without hard cuts
    if (N < 2) return 0.5;

    const mean = signals.reduce((a, b) => a + b, 0) / N;
    let sumSq = 0;
    let maxZ = -Infinity;
    let minZ = Infinity;
    let currentZ = 0;

    for (let i = 0; i < N; i++) {
      const diff = signals[i] - mean;
      sumSq += diff * diff;
      currentZ += diff;
      if (currentZ > maxZ) maxZ = currentZ;
      if (currentZ < minZ) minZ = currentZ;
    }

    const R = maxZ - minZ;
    const S = Math.sqrt(sumSq / N) || Number.EPSILON;
    const RS = R / S;
    const hurst = Math.log2(RS) / Math.log2(N);
    return Math.max(0.01, Math.min(0.99, hurst));
  }

  // --- 1. TARGET DNA PROFILE EXTRACTION ---

  public extractTargetDNAProfile(
    historicalVectors: Float32Array[],
    temporalDepth: number,
  ): DNAProfile {
    const depth = Math.min(temporalDepth, historicalVectors.length);
    const recentVectors = historicalVectors.slice(
      historicalVectors.length - depth,
    );

    const medianVector = new Float32Array(this.numAlgos);
    const varianceVector = new Float32Array(this.numAlgos);

    for (let a = 0; a < this.numAlgos; a++) {
      const values = recentVectors
        .map((vec) => vec[a])
        .sort((v1, v2) => v1 - v2);

      // Mathematical median (outlier-resistant)
      const mid = Math.floor(values.length / 2);
      medianVector[a] =
        values.length % 2 !== 0
          ? values[mid]
          : (values[mid - 1] + values[mid]) / 2.0;

      // Variance
      const mean = values.reduce((acc, val) => acc + val, 0) / values.length;
      varianceVector[a] =
        values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
        values.length;
    }

    const norms = recentVectors.map((vec) => this.l2Norm(vec));
    const hurst = this.calculateHurstExponent(norms);
    const entropy = this.calculateShannonEntropyNormalized(medianVector);

    return {
      algoKeys: this.algoKeys,
      medianVector,
      varianceVector,
      entropy,
      hurstExponent: hurst,
    };
  }

  // --- 2. CANDIDATE DISTANCE & DECOUPLED HARMONICS ---

  /**
   * HIGH-PERFORMANCE SPECTRAL AUTO-CORRELATION (Isolement Spectral 5/5)
   * Evaluates phase synchronization via circular Fourier cross-correlation.
   * Optimizations:
   *  - Precomputed trigonometric lookup table avoiding high Math.cos/Math.sin costs.
   *  - Target density DFT is pre-calculated once and cached over the identical history reference.
   *  - Candidate DFT loops only through non-zero candidate indices (sparse signal) instead of N=90.
   */
  public evaluateSpectral55Alignment(
    candidateNumbers: number[],
    historicalDraws: number[][],
  ): number {
    const N = 90;
    const limit = Math.floor(N / 2);
    DNAOptimizer.initTrigTables();
    const cosTable = DNAOptimizer.cosTable!;
    const sinTable = DNAOptimizer.sinTable!;

    // Rebuild Target fourier density ONLY if the history is different
    if (this.lastHistoryRef !== historicalDraws || !this.targetDftCached) {
      this.lastHistoryRef = historicalDraws;

      const T = new Float32Array(N);
      let totalBalls = 0;
      historicalDraws.forEach((draw) => {
        draw.forEach((num) => {
          if (num >= 1 && num <= N) {
            T[num - 1] += 1.0;
            totalBalls++;
          }
        });
      });

      if (totalBalls > 0) {
        for (let i = 0; i < N; i++) T[i] /= totalBalls;
      }

      const T_re = new Float32Array(limit + 1);
      const T_im = new Float32Array(limit + 1);
      const magT = new Float32Array(limit + 1);

      for (let u = 1; u <= limit; u++) {
        let t_re = 0;
        let t_im = 0;
        for (let n = 0; n < N; n++) {
          if (T[n] > 0) {
            const idx = u * N + n;
            t_re += T[n] * cosTable[idx];
            t_im -= T[n] * sinTable[idx];
          }
        }
        T_re[u] = t_re;
        T_im[u] = t_im;
        magT[u] = Math.sqrt(t_re * t_re + t_im * t_im) || Number.EPSILON;
      }

      this.targetDftCached = { T_re, T_im, magT };
    }

    const { T_re, T_im, magT } = this.targetDftCached;
    let crossCorrReal = 0;

    for (let u = 1; u <= limit; u++) {
      let S_re = 0,
        S_im = 0;
      candidateNumbers.forEach((num) => {
        if (num >= 1 && num <= N) {
          const idx = u * N + (num - 1);
          S_re += cosTable[idx];
          S_im -= sinTable[idx];
        }
      });

      const magS = Math.sqrt(S_re * S_re + S_im * S_im) || Number.EPSILON;
      const phaseCorr = (S_re * T_re[u] + S_im * T_im[u]) / (magS * magT[u]);
      crossCorrReal += phaseCorr;
    }

    return Math.max(0.01, Math.min(0.99, crossCorrReal / limit));
  }

  /**
   * HIGH-PERFORMANCE TOPOLOGICAL RESONANCE + LYAPUNOV DIVERGENCE
   * Optimizations:
   *  - Calculates the heavy Lyapunov trajectory exponent over historical steps ONCE and caches the results,
   *    releasing massive CPU cycles from candidate-specific iterations.
   */
  public evaluateTopologicalLyapunov(
    candidateNumbers: number[],
    historicalDraws: number[][],
    entropy: number = 0.5,
    hurstExponent: number = 0.5,
  ): number {
    if (historicalDraws.length < 2) return 0.5;

    // Build or leverage cached historical chaotic attractor trajectories
    if (
      this.lastLyapunovHistoryRef !== historicalDraws ||
      !this.lyapunovExponentCached
    ) {
      this.lastLyapunovHistoryRef = historicalDraws;

      const horizon = Math.min(30, historicalDraws.length);
      const getGridPos = (val: number) => {
        const row = Math.floor((val - 1) / 10);
        const col = (val - 1) % 10;
        return { row, col };
      };

      let lyapunovSum = 0;
      let validSteps = 0;
      for (let i = 0; i < horizon - 1; i++) {
        const t0 = historicalDraws[i];
        const t1 = historicalDraws[i + 1];
        if (!t0 || !t1) continue;

        let topologicalDist = 0;
        for (const c1 of t1) {
          let minDist = 999;
          const pos1 = getGridPos(c1);
          for (const c0 of t0) {
            const pos0 = getGridPos(c0);
            const d = Math.sqrt(
              Math.pow(pos1.row - pos0.row, 2) +
                Math.pow(pos1.col - pos0.col, 2),
            );
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

      this.lyapunovExponentCached = { lambda, isChaotic, divergenceForce };
    }

    const { isChaotic, divergenceForce } = this.lyapunovExponentCached;
    const lastDraw = historicalDraws[0] || [];
    if (!Array.isArray(lastDraw) || lastDraw.length === 0) return 0.5;
    let candidateResonance = 0;

    // Zero-magic continuous damping
    const gridDamping = Math.exp(-0.5 * entropy);
    const symmetryDamping = hurstExponent;

    candidateNumbers.forEach((c) => {
      let maxSim = 0.0;
      const posC_row = Math.floor((c - 1) / 10);
      const posC_col = (c - 1) % 10;

      lastDraw.forEach((w) => {
        const posW_row = Math.floor((w - 1) / 10);
        const posW_col = (w - 1) % 10;

        const gridDist = Math.sqrt(
          Math.pow(posC_row - posW_row, 2) + Math.pow(posC_col - posW_col, 2),
        );
        const gridSim = Math.exp(-gridDamping * gridDist);

        // Symétrie topologique et inversion continue (DÉTERMINISTE ZÉRO NOMBRES MAGIQUES)
        const circularDiff = Math.min(Math.abs(c - w), 90 - Math.abs(c - w));
        const distanceAffinity = Math.exp(-Math.pow(circularDiff, 2) / 2.0); // Gaussienne

        // Affinité de symétrie circulaire : proximité numérique réelle sur le tore [1,90].
        // L'ancien terme "miroir décimal" (inversion des chiffres, ex. 12 -> 21) a été retiré :
        // la numération décimale est une convention humaine sans aucun lien causal avec le tirage.
        const mirrorSim = distanceAffinity * symmetryDamping;

        const sim = Math.max(gridSim, mirrorSim);
        if (sim > maxSim) maxSim = sim;
      });

      // Near-Miss rates modulated dynamically by chaotic Lyapunov attractor density
      if (isChaotic) {
        candidateResonance += (1.0 - maxSim) * divergenceForce;
      } else {
        candidateResonance += maxSim * (1.0 - divergenceForce);
      }
    });

    return Math.max(
      0.01,
      Math.min(0.99, candidateResonance / candidateNumbers.length),
    );
  }

  public evaluateCandidate(
    dnaMatrix: Float32Array[],
    targetProfile: DNAProfile,
    candidateNumbers?: number[],
    historicalDraws?: number[][],
  ): DNACandidate {
    const K = dnaMatrix.length;
    const synergyVector = new Float32Array(this.numAlgos);

    for (let a = 0; a < this.numAlgos; a++) {
      let sumValue = 0;
      for (let k = 0; k < K; k++) {
        sumValue += dnaMatrix[k][a];
      }
      synergyVector[a] = sumValue / K;
    }

    let varianceCost = 0;
    for (let a = 0; a < this.numAlgos; a++) {
      const diff = synergyVector[a] - targetProfile.medianVector[a];
      const invVar = 1.0 / (targetProfile.varianceVector[a] || Number.EPSILON);
      varianceCost += diff * diff * invVar;
    }
    varianceCost = Math.sqrt(varianceCost) / this.numAlgos;

    const cosDist = this.cosineDistance(
      synergyVector,
      targetProfile.medianVector,
    );
    const klDiv = this.klDivergence(synergyVector, targetProfile.medianVector);

    let distance = (cosDist + klDiv + varianceCost) / 3.0;

    if (candidateNumbers && historicalDraws && historicalDraws.length > 0) {
      const spectralSync = this.evaluateSpectral55Alignment(
        candidateNumbers,
        historicalDraws,
      );
      const topoLyapunovSync = this.evaluateTopologicalLyapunov(
        candidateNumbers,
        historicalDraws,
        targetProfile.entropy,
        targetProfile.hurstExponent,
      );

      // Zero-magic continuous distance modulation
      const spectralWeight = 0.5 * (1.0 - targetProfile.entropy);
      const lyapunovWeight = 0.5 * targetProfile.hurstExponent;
      distance =
        distance *
        Math.max(
          0.1,
          1.0 -
            spectralWeight * spectralSync -
            lyapunovWeight * topoLyapunovSync,
        );
    }

    let diversitySum = 0;
    let pairs = 0;
    for (let i = 0; i < K; i++) {
      for (let j = i + 1; j < K; j++) {
        diversitySum += this.cosineDistance(dnaMatrix[i], dnaMatrix[j]);
        pairs++;
      }
    }
    const diversityScore = pairs > 0 ? diversitySum / pairs : 0;

    return {
      numbers: candidateNumbers || [],
      dnaMatrix,
      synergyVector,
      distance,
      diversityScore,
    };
  }

  // --- 3. CORE WEIGHT OPTIMIZERS & REGULARIZATION ---

  /**
   * KALMAN ADAPTIVE FILTER (with dynamic variance shrinkage to avoid overfitting on small history)
   * Regularizations:
   *  - Ledger-Wolf covariance shrinkage stabilizes covariance calculations under scarce history.
   */
  public applyKalmanDriftCorrection(
    candidateWeights: AlgoWeights,
    profile: DNAProfile,
    historicalVectors: Float32Array[],
  ): AlgoWeights {
    const adjustedWeights = { ...candidateWeights };
    const numSteps = Math.min(15, historicalVectors.length);
    if (numSteps < 3)
      return this.applyDriftCorrection(candidateWeights, profile);

    const x = new Float32Array(this.numAlgos);
    const P = new Float32Array(this.numAlgos);

    // Variance Shrinkage: blend noisy empirical variance with total average variance
    const avgVariance =
      profile.varianceVector.reduce((a, b) => a + b, 0) / this.numAlgos;
    const stabilizationFactor = Math.max(
      0.1,
      1.0 / Math.sqrt(historicalVectors.length || 1),
    );

    for (let i = 0; i < this.numAlgos; i++) {
      const empiricalVar = profile.varianceVector[i];
      const shrunkedVar =
        (1.0 - stabilizationFactor) * empiricalVar +
        stabilizationFactor * avgVariance;
      P[i] = Math.max(1e-4, shrunkedVar);
    }

    const Q_base = Math.max(1e-6, profile.entropy * 1e-4);
    const R = new Float32Array(this.numAlgos);
    for (let i = 0; i < this.numAlgos; i++) {
      const snr = profile.medianVector[i] / (Math.sqrt(P[i]) || Number.EPSILON);
      R[i] = 1.0 / Math.max(1e-2, snr * snr);
    }

    for (
      let step = historicalVectors.length - numSteps;
      step < historicalVectors.length;
      step++
    ) {
      const measurement = historicalVectors[step];

      for (let i = 0; i < this.numAlgos; i++) {
        const P_pred = P[i] + Q_base;
        const y = measurement[i] - (profile.medianVector[i] + x[i]);
        const S_cov = P_pred + R[i];
        const K_gain = P_pred / S_cov;

        x[i] = x[i] + K_gain * y;
        P[i] = (1.0 - K_gain) * P_pred;
      }
    }

    const couplingFactor = 1.0 / Math.sqrt(this.numAlgos);
    for (let i = 0; i < this.numAlgos; i++) {
      const key = this.algoKeys[i];
      if (adjustedWeights[key] === undefined) continue;

      const scaleRef = Math.max(
        1e-3,
        Math.abs(profile.medianVector[i]) + Math.sqrt(Math.max(0, P[i])),
      );
      const dimensionlessShift = Math.tanh(x[i] / scaleRef) * couplingFactor;
      adjustedWeights[key] = Math.max(
        Number.EPSILON,
        candidateWeights[key] * (1.0 + dimensionlessShift),
      );
    }

    return this.normalizeWeightsMass(adjustedWeights);
  }

  /**
   * Perte propre non ordonnée (invariant par permutation des étiquettes 1..90) :
   * combinaison équipondérée Brier + Log-Loss de Bernoulli sur les marginales normalisées (Σ p = 5).
   */
  private evaluateUnorderedProperLoss(
    w: AlgoWeights,
    drawIndices: number[],
    historicalDraws: { gagnants: number[] }[],
    breakdownsByDraw: Record<number, Record<number, Record<AlgoKey, number>>>,
  ): number {
    if (drawIndices.length === 0) return 0;
    let totalLoss = 0;
    const rawScores = new Float64Array(90);

    for (const d of drawIndices) {
      const winners = new Set(historicalDraws[d]?.gagnants || []);
      const numberBreakdowns = breakdownsByDraw[d] || {};

      let sumRaw = 0;
      for (let n = 1; n <= 90; n++) {
        const breakdown = numberBreakdowns[n] || {};
        let score = 0;
        for (const k of this.algoKeys) {
          score += (w[k] || 0) * (breakdown[k] || 0);
        }
        const clipped = Math.max(0, score);
        rawScores[n - 1] = clipped;
        sumRaw += clipped;
      }

      let brier = 0;
      let logLoss = 0;
      for (let n = 1; n <= 90; n++) {
        const rawProb = sumRaw > 1e-12 ? (5.0 * rawScores[n - 1]) / sumRaw : 5.0 / 90.0;
        const p = Math.min(1.0 - 1e-6, Math.max(1e-6, rawProb));
        const y = winners.has(n) ? 1.0 : 0.0;
        const diff = p - y;
        brier += diff * diff;
        logLoss -= y * Math.log(p) + (1.0 - y) * Math.log(1.0 - p);
      }

      totalLoss += 0.5 * (brier / 90.0) + 0.5 * (logLoss / 90.0);
    }

    return totalLoss / drawIndices.length;
  }

  /**
   * BATCH GRADIENT DESCENT BACKPROPAGATION (with chronological train/validation split & scale-adaptive L2)
   */
  public backpropagateWeights(
    initialWeights: AlgoWeights,
    historicalDraws: { gagnants: number[] }[],
    breakdownsByDraw: Record<number, Record<number, Record<AlgoKey, number>>>,
    learningRate: number = 0.05,
  ): AlgoWeights {
    const weights = this.normalizeWeightsMass({ ...initialWeights });
    const numDraws = historicalDraws.length;
    if (numDraws === 0) return weights;

    const valCount =
      numDraws >= 4 ? Math.max(1, Math.min(Math.floor(numDraws * 0.25), numDraws - 2)) : 0;
    const valIndices: number[] = [];
    const trainIndices: number[] = [];
    for (let d = 0; d < numDraws; d++) {
      if (d < valCount) valIndices.push(d);
      else trainIndices.push(d);
    }

    const gradients = new Float32Array(this.numAlgos);

    for (const d of trainIndices) {
      const winners = new Set(historicalDraws[d]?.gagnants || []);
      const numberBreakdowns = breakdownsByDraw[d] || {};

      for (let n = 1; n <= 90; n++) {
        const breakdown = numberBreakdowns[n] || {};

        let predictedScore = 0;
        this.algoKeys.forEach((k) => {
          predictedScore += (weights[k] || 0) * (breakdown[k] || 0);
        });

        const target = winners.has(n) ? 1.0 : 0.0;
        const residual = predictedScore - target;

        this.algoKeys.forEach((k, idx) => {
          const scoreContribution = breakdown[k] || 0;
          gradients[idx] += residual * scoreContribution;
        });
      }
    }

    const trainDrawsCount = Math.max(1, trainIndices.length);
    const totalSamples = trainDrawsCount * 90;
    const factor = 2.0 / totalSamples;
    const lambdaL2 = 0.01 / Math.sqrt(trainDrawsCount);

    const initialEntropy = this.calculateShannonEntropyNormalized(
      new Float32Array(this.algoKeys.map((k) => weights[k] || 0)),
    );
    const adaptiveLR = learningRate * (1.0 + Math.tanh(1.0 - initialEntropy));

    const candidate: AlgoWeights = { ...weights };
    for (let idx = 0; idx < this.numAlgos; idx++) {
      const k = this.algoKeys[idx];
      if (candidate[k] === undefined) continue;

      const avgGradient = gradients[idx] * factor;
      const l2Penalty = lambdaL2 * candidate[k];

      candidate[k] = Math.max(
        Number.EPSILON,
        candidate[k] - adaptiveLR * (avgGradient + l2Penalty),
      );
    }

    const candidateNorm = this.normalizeWeightsMass(candidate);
    if (valIndices.length > 0) {
      const initValLoss = this.evaluateUnorderedProperLoss(
        weights,
        valIndices,
        historicalDraws,
        breakdownsByDraw,
      );
      const candValLoss = this.evaluateUnorderedProperLoss(
        candidateNorm,
        valIndices,
        historicalDraws,
        breakdownsByDraw,
      );
      if (candValLoss > initValLoss + 1e-6) {
        return weights;
      }
    }

    return candidateNorm;
  }

  /**
   * DETAILED SYMMETRIC COORDINATE DESCENT OPTIMIZER
   * Evaluates unordered proper Brier + Log-Loss on training split with chronological holdout early-stopping.
   */
  public optimizeWeightsCoordinateDescent(
    initialWeights: AlgoWeights,
    historicalDraws: { gagnants: number[] }[],
    breakdownsByDraw: Record<number, Record<number, Record<AlgoKey, number>>>,
    iterations: number = 3,
  ): AlgoWeights {
    let weights = this.normalizeWeightsMass({ ...initialWeights });
    const numDraws = historicalDraws.length;
    if (numDraws === 0) return weights;

    const valCount =
      numDraws >= 4 ? Math.max(1, Math.min(Math.floor(numDraws * 0.25), numDraws - 2)) : 0;
    const valIndices: number[] = [];
    const trainIndices: number[] = [];
    for (let d = 0; d < numDraws; d++) {
      if (d < valCount) valIndices.push(d);
      else trainIndices.push(d);
    }

    let bestTrainLoss = this.evaluateUnorderedProperLoss(
      weights,
      trainIndices,
      historicalDraws,
      breakdownsByDraw,
    );
    let bestValWeights = { ...weights };
    let bestValLoss =
      valIndices.length > 0
        ? this.evaluateUnorderedProperLoss(
            weights,
            valIndices,
            historicalDraws,
            breakdownsByDraw,
          )
        : bestTrainLoss;

    const initialEntropy = this.calculateShannonEntropyNormalized(
      new Float32Array(this.algoKeys.map((k) => weights[k] || 0)),
    );
    const stepScale = 0.01 + 0.03 * (1.0 - initialEntropy);

    for (let iter = 0; iter < iterations; iter++) {
      let improved = false;
      const stepSize = stepScale / (iter + 1);

      for (const key of this.algoKeys) {
        if (weights[key] === undefined) continue;
        const currentVal = weights[key];

        // Positive coordinate push
        const wPlus = { ...weights, [key]: Math.min(1.0, currentVal + stepSize) };
        const wPlusNorm = this.normalizeWeightsMass(wPlus);
        const lossPlus = this.evaluateUnorderedProperLoss(
          wPlusNorm,
          trainIndices,
          historicalDraws,
          breakdownsByDraw,
        );

        // Negative coordinate push
        const wMinus = {
          ...weights,
          [key]: Math.max(Number.EPSILON, currentVal - stepSize),
        };
        const wMinusNorm = this.normalizeWeightsMass(wMinus);
        const lossMinus = this.evaluateUnorderedProperLoss(
          wMinusNorm,
          trainIndices,
          historicalDraws,
          breakdownsByDraw,
        );

        if (lossPlus < bestTrainLoss && lossPlus <= lossMinus) {
          weights = wPlusNorm;
          bestTrainLoss = lossPlus;
          improved = true;
        } else if (lossMinus < bestTrainLoss) {
          weights = wMinusNorm;
          bestTrainLoss = lossMinus;
          improved = true;
        }
      }

      if (valIndices.length > 0) {
        const valLoss = this.evaluateUnorderedProperLoss(
          weights,
          valIndices,
          historicalDraws,
          breakdownsByDraw,
        );
        if (valLoss < bestValLoss - 1e-6) {
          bestValLoss = valLoss;
          bestValWeights = { ...weights };
        } else {
          break;
        }
      }

      if (!improved) break;
    }

    return valIndices.length > 0
      ? this.normalizeWeightsMass(bestValWeights)
      : this.normalizeWeightsMass(weights);
  }

  private normalizeWeightsMass(weights: AlgoWeights): AlgoWeights {
    const sum =
      Object.values(weights).reduce((a, b) => a + b, 0) || Number.EPSILON;
    const normalized = { ...weights };
    for (const k in normalized) {
      normalized[k as AlgoKey] = normalized[k as AlgoKey] / sum;
    }
    return normalized;
  }

  public applyDriftCorrection(
    candidateWeights: AlgoWeights,
    profile: DNAProfile,
  ): AlgoWeights {
    const adjustedWeights = { ...candidateWeights };
    const maxWeightVal = 1.0;

    // Zero-magic continuous drift indicators derived from pure DNA signals
    const dHurst = 1.0 - profile.hurstExponent;
    const dEntropy = profile.entropy;
    const alphaDrift = (dHurst + dEntropy) / 2.0;

    const persistentAlgos = new Set<AlgoKey>([
      AlgoKey.FREQUENCY,
      AlgoKey.MARKOV,
      AlgoKey.MOMENTUM,
      AlgoKey.TEMPORAL,
    ]);

    const meanRevertingAlgos = new Set<AlgoKey>([
      AlgoKey.GAPS,
      AlgoKey.SPATIAL,
      AlgoKey.AFFINITY,
    ]);

    const spectralAlgos = new Set<AlgoKey>([
      AlgoKey.SPECTRAL,
      AlgoKey.FRACTAL,
      AlgoKey.BAYES,
    ]);

    const numEstimators = this.numAlgos || 1;
    const couplingCoefficient = 1.0 / Math.sqrt(numEstimators);

    for (const key of this.algoKeys) {
      if (adjustedWeights[key] === undefined) continue;

      let scale = 1.0;
      if (persistentAlgos.has(key)) {
        scale = 1.0 - alphaDrift * couplingCoefficient;
      } else if (meanRevertingAlgos.has(key) || spectralAlgos.has(key)) {
        scale = 1.0 + alphaDrift * couplingCoefficient;
      }

      const idx = this.algoKeys.indexOf(key);
      const snr =
        profile.medianVector[idx] /
        (Math.sqrt(profile.varianceVector[idx]) || Number.EPSILON);
      const baseNormWeight = Math.min(maxWeightVal, snr);

      const baseRegimeFactor = profile.entropy * (1.0 - profile.hurstExponent);
      adjustedWeights[key] =
        (candidateWeights[key] * (1.0 - baseRegimeFactor) +
          baseNormWeight * baseRegimeFactor) *
        scale;
      adjustedWeights[key] = Math.max(Number.EPSILON, adjustedWeights[key]);
    }

    return this.normalizeWeightsMass(adjustedWeights);
  }

  // --- 4. EXPLAINABLE ATTRIBUTION PREDICTION (XAP) ---

  public generateXAP(
    candidate: DNACandidate,
    candidateNumbers: number[],
  ): XAPExplanation[] {
    const explanations: XAPExplanation[] = [];

    for (let k = 0; k < candidateNumbers.length; k++) {
      const dna = candidate.dnaMatrix[k];
      let maxScore = -Infinity;
      let dominantIdx = 0;
      let totalScore = 0;
      const dnaRecord: Partial<Record<AlgoKey, number>> = {};

      for (let a = 0; a < this.numAlgos; a++) {
        const val = Math.max(0, dna[a]);
        totalScore += val;
        dnaRecord[this.algoKeys[a]] = val;
        if (val > maxScore) {
          maxScore = val;
          dominantIdx = a;
        }
      }

      const contributionPercentage =
        totalScore > 0 ? (maxScore / totalScore) * 100 : 0;

      // 1. Calcul de l'Entropie de Composition Individuelle (Shannon normalisée)
      let compositionEntropy = 1.0;
      if (totalScore > 0) {
        let entropySum = 0;
        for (let a = 0; a < this.numAlgos; a++) {
          const p = Math.max(0, dna[a]) / totalScore;
          if (p > Number.EPSILON) {
            entropySum -= p * Math.log2(p);
          }
        }
        const maxEnt = Math.log2(this.numAlgos) || 1.0;
        compositionEntropy = entropySum / maxEnt;
      }

      // 2. Calcul du Coefficient de Gini de Composition Individuel
      let compositionGini = 0.0;
      if (totalScore > 0) {
        let diffSum = 0;
        for (let i = 0; i < this.numAlgos; i++) {
          const valI = Math.max(0, dna[i]);
          for (let j = 0; j < this.numAlgos; j++) {
            const valJ = Math.max(0, dna[j]);
            diffSum += Math.abs(valI - valJ);
          }
        }
        compositionGini = diffSum / (2.0 * this.numAlgos * totalScore);
      }

      // 3. Identification des Co-Contributeurs (Synergie)
      // Seuil déterministe objectif : supérieur à la contribution moyenne attendue (1 / numAlgos)
      const expectedAvgContribution = 1.0 / (this.numAlgos || 1);
      const synergyAlgos: AlgoKey[] = [];
      this.algoKeys.forEach((key) => {
        const val = dnaRecord[key] || 0;
        const contribution = totalScore > 0 ? val / totalScore : 0;
        if (contribution > expectedAvgContribution) {
          synergyAlgos.push(key);
        }
      });

      // 4. Valeurs de Shapley Exactes du modèle additif linéaire
      // Le score agrégé étant additif, v(S) = Σ_{i∈S} dna[i], la contribution marginale
      // exacte de chaque algorithme est exactement sa part linéaire dna[i] / Σ dna.
      const shapleyValues: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
      for (let a = 0; a < this.numAlgos; a++) {
        const val = Math.max(0, dna[a]);
        shapleyValues[this.algoKeys[a]] = totalScore > 0 ? (val / totalScore) * 100 : 0;
      }

      explanations.push({
        number: candidateNumbers[k],
        dominantAlgo: this.algoKeys[dominantIdx],
        contributionPercentage,
        dnaVector: dnaRecord as Record<AlgoKey, number>,
        compositionEntropy,
        compositionGini,
        synergyAlgos,
        shapleyValues,
      });
    }

    return explanations;
  }

  /**
   * CALIBRATION D'ADN VIA CONTRASTE GAGNANTS vs NON-GAGNANTS
   * Compare la composition normalisée des numéros gagnants à celle des numéros non-gagnants
   * du même tirage afin d'éliminer tout biais lié aux échelles brutes des algorithmes.
   */
  public calibrateDNAFromWinningComposition(
    _currentWeights: AlgoWeights,
    winningXAPs: XAPExplanation[],
    nonWinningVectors?: Array<Float32Array | Partial<Record<AlgoKey, number>>>,
  ): { algo: AlgoKey; proposedWeightChange: number; reason: string }[] {
    const adjustments: { algo: AlgoKey; proposedWeightChange: number; reason: string }[] = [];
    if (
      winningXAPs.length === 0 ||
      !nonWinningVectors ||
      nonWinningVectors.length === 0
    ) {
      return adjustments;
    }

    // 1. Composition moyenne des gagnants et des non-gagnants (chacune normalisée L1)
    const winAvg: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
    const loseAvg: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
    this.algoKeys.forEach((key) => {
      winAvg[key] = 0;
      loseAvg[key] = 0;
    });

    for (const xap of winningXAPs) {
      for (const key of this.algoKeys) {
        winAvg[key] += Math.max(0, xap.dnaVector[key] || 0);
      }
    }

    for (const vec of nonWinningVectors) {
      if (vec instanceof Float32Array) {
        for (let i = 0; i < this.numAlgos; i++) {
          const key = this.algoKeys[i];
          loseAvg[key] += Math.max(0, vec[i] || 0);
        }
      } else {
        for (const key of this.algoKeys) {
          loseAvg[key] += Math.max(0, vec[key] || 0);
        }
      }
    }

    let totalWinScore = 0;
    let totalLoseScore = 0;
    this.algoKeys.forEach((key) => {
      totalWinScore += winAvg[key];
      totalLoseScore += loseAvg[key];
    });
    if (totalWinScore <= 1e-12 || totalLoseScore <= 1e-12) {
      return adjustments;
    }

    this.algoKeys.forEach((key) => {
      winAvg[key] /= totalWinScore;
      loseAvg[key] /= totalLoseScore;
    });

    // 2. Entropie et Gini de la composition gagnante (modulation continue du taux)
    const compositionProbArray = new Float32Array(this.numAlgos);
    this.algoKeys.forEach((key, i) => {
      compositionProbArray[i] = winAvg[key];
    });

    const globalEntropy = this.calculateShannonEntropyNormalized(compositionProbArray);

    let giniSum = 0;
    for (let i = 0; i < this.numAlgos; i++) {
      for (let j = 0; j < this.numAlgos; j++) {
        giniSum += Math.abs(compositionProbArray[i] - compositionProbArray[j]);
      }
    }
    const globalGini =
      giniSum /
      (2.0 * this.numAlgos * (compositionProbArray.reduce((a, b) => a + b, 0) || 1.0));

    const learningFactor =
      DNA_LEARNING_CALIBRATION.BASE_LEARNING_FACTOR *
      (1.0 + globalGini - globalEntropy);

    // 3. Contraste gagnants − non-gagnants (strictement nul sous tirage i.i.d. à amplitude égale)
    this.algoKeys.forEach((key) => {
      const contrast = winAvg[key] - loseAvg[key];
      const rawAdjust = contrast * learningFactor;
      const proposedWeightChange = parseFloat(rawAdjust.toFixed(4));

      if (Math.abs(proposedWeightChange) > 1e-4) {
        const direction =
          proposedWeightChange > 0
            ? "Sur-exprimé chez les gagnants"
            : "Sous-exprimé chez les gagnants";
        const impactPercent = (proposedWeightChange * 100.0).toFixed(2);
        const reason = `Contraste ADN gagnants vs non-gagnants : ${direction} (Δpart=${(contrast * 100).toFixed(2)}%, Gini=${globalGini.toFixed(2)}, Entropy=${globalEntropy.toFixed(2)}). Ajustement proposé de ${proposedWeightChange > 0 ? "+" : ""}${impactPercent}%.`;

        adjustments.push({
          algo: key,
          proposedWeightChange,
          reason,
        });
      }
    });

    return adjustments;
  }
}
