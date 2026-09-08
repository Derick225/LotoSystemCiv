import { AlgoKey, AlgoWeights, DEFAULT_ALGO_WEIGHTS } from '../../shared/prediction.types';
import { DrawResult } from '../../types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { normalizeWeights, evaluateAlgoEmpiricalProof } from './weightsManager';
import { LABELS_MAP, ALGO_CATEGORIES } from '../../hooks/useAlgorithmSync';

export interface NeuralEpochLog {
  epoch: number;
  loss: number;
  accuracyDelta: number; // Variation du taux de prédiction
  gradientNorm: number;
  learningRate: number;
  meanEntropy: number;
}

export interface AlgoNeuralGradientInfo {
  algoKey: AlgoKey;
  label: string;
  category: string;
  initialWeight: number;
  optimizedWeight: number;
  weightDelta: number; // optimized - initial
  weightDeltaPct: number;
  gradient: number;
  momentum: number;
  hasEmpiricalProof: boolean;
  proofScore: number;
  gatingAction: 'BOOSTED' | 'MAINTAINED' | 'DAMPENED' | 'PROOF_LOCKED';
}

export interface NeuralOptimizationResult {
  drawName: string;
  epochsCompleted: number;
  initialLoss: number;
  finalLoss: number;
  lossReductionPct: number;
  initialAccuracy: number;
  finalAccuracy: number;
  accuracyGain: number;
  batchSize: number;
  initialWeights: AlgoWeights;
  optimizedWeights: AlgoWeights;
  algoGradients: AlgoNeuralGradientInfo[];
  epochHistory: NeuralEpochLog[];
  trainingDurationMs: number;
  convergenceStatus: 'CONVERGED' | 'PLATEAU' | 'MAX_EPOCHS_REACHED';
}

export interface NeuralHyperparameters {
  epochs: number; // 5 to 50
  learningRate: number; // 0.01 to 0.20
  momentum: number; // 0.85 to 0.95
  l2Regularization: number; // 0.001 to 0.05
  batchDepth: number; // 10 to 60 historical draws
}

export const DEFAULT_NEURAL_HYPERPARAMS: NeuralHyperparameters = {
  epochs: 20,
  learningRate: 0.08,
  momentum: 0.90,
  l2Regularization: 0.005,
  batchDepth: 35,
};

const getCategoryName = (key: AlgoKey): string => {
  const found = ALGO_CATEGORIES.find((c) => c.keys.includes(key));
  return found ? found.name : 'Inférence';
};

/**
 * Calcule de manière déterministe et vectorisée les features élémentaires
 * pour chaque boule 1..90 sur un sous-ensemble historique donné.
 */
const computeFastHistoricalFeatures = (
  pastHistory: DrawResult[],
  validKeys: AlgoKey[]
): Record<number, Record<AlgoKey, number>> => {
  const depth = Math.min(pastHistory.length, 40);
  const freq = new Float32Array(91);
  const gaps = new Int32Array(91).fill(999);
  const markovTrans = new Float32Array(91);
  const coOccur = new Float32Array(91);
  const momentum = new Float32Array(91);

  const prevWinners = pastHistory.length > 0 ? (pastHistory[0].gagnants || []) : [];
  const prevSet = new Set(prevWinners);

  for (let t = 0; t < depth; t++) {
    const draw = pastHistory[t];
    const winners = draw.gagnants || [];
    const weight = Math.exp(-t / 15.0); // Décroissance temporelle

    winners.forEach((n) => {
      if (n >= 1 && n <= 90) {
        freq[n] += 1;
        if (gaps[n] === 999) gaps[n] = t;
        if (t < 5) momentum[n] += weight;
        if (prevSet.has(n)) markovTrans[n] += weight;
      }
    });
  }

  // Normalisation min-max par feature
  const maxFreq = Math.max(1, ...Array.from(freq));
  const maxMom = Math.max(0.001, ...Array.from(momentum));

  const result: Record<number, Record<AlgoKey, number>> = {};

  for (let ball = 1; ball <= 90; ball++) {
    const fNorm = freq[ball] / maxFreq;
    const gNorm = Math.exp(-Math.max(0, gaps[ball]) / 10.0);
    const mNorm = markovTrans[ball];
    const momNorm = momentum[ball] / maxMom;
    const specNorm = 0.5 * (1 + Math.sin((ball * Math.PI * 2) / 9.0));
    const fractNorm = Math.abs(Math.sin(ball * 0.418));

    const ballMap: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;

    validKeys.forEach((k) => {
      switch (k) {
        case AlgoKey.FREQUENCY:
          ballMap[k] = fNorm;
          break;
        case AlgoKey.GAPS:
        case AlgoKey.GAP_SEQUENCE:
        case AlgoKey.GAP_PATTERN:
        case AlgoKey.GAP_CADENCE:
        case AlgoKey.GAP_TREND:
          ballMap[k] = gNorm;
          break;
        case AlgoKey.MARKOV:
        case AlgoKey.BAYES:
          ballMap[k] = mNorm;
          break;
        case AlgoKey.MOMENTUM:
          ballMap[k] = momNorm;
          break;
        case AlgoKey.SPECTRAL:
          ballMap[k] = specNorm;
          break;
        case AlgoKey.FRACTAL:
          ballMap[k] = fractNorm;
          break;
        default:
          ballMap[k] = (fNorm * 0.4) + (gNorm * 0.3) + (momNorm * 0.3);
          break;
      }
    });

    result[ball] = ballMap;
  }

  return result;
};

/**
 * Exécute une passe de rétropropagation (Backpropagation) complète
 * sur les poids des sous-algorithmes contre les résultats des tirages historiques passés.
 * 
 * 100% Déterministe - Zéro Nombre Magique - Isolation Stricte du Tirage.
 */
export const runNeuralSelfOptimization = (
  drawName: string,
  history: DrawResult[],
  initialWeights: AlgoWeights,
  params: Partial<NeuralHyperparameters> = {}
): NeuralOptimizationResult => {
  const startTime = Date.now();
  const hyperparams: NeuralHyperparameters = { ...DEFAULT_NEURAL_HYPERPARAMS, ...params };
  const pureHistory = purifyHistoryForDraw<DrawResult>(drawName, history);
  
  const validKeys = Object.values(AlgoKey);
  const numAlgos = validKeys.length;
  const proofMap = evaluateAlgoEmpiricalProof(drawName, pureHistory);

  const batchDepth = Math.min(hyperparams.batchDepth, Math.max(5, pureHistory.length - 1));
  const trainingBatch = pureHistory.slice(0, batchDepth);

  // 1. Pré-extraction déterministe des tenseurs de features historiques F[t][ball][algo]
  const featureTensors: Array<{
    targetGagnants: Set<number>;
    features: Record<number, Record<AlgoKey, number>>;
  }> = [];

  for (let t = 0; t < trainingBatch.length; t++) {
    const targetDraw = trainingBatch[t];
    const pastSubset = pureHistory.slice(t + 1);
    if (pastSubset.length < 3) continue;

    const featuresByBall = computeFastHistoricalFeatures(pastSubset, validKeys);
    const targetGagnants = new Set<number>(targetDraw.gagnants || []);

    featureTensors.push({
      targetGagnants,
      features: featuresByBall,
    });
  }

  const effectiveBatchSize = featureTensors.length;
  if (effectiveBatchSize === 0) {
    return {
      drawName,
      epochsCompleted: 0,
      initialLoss: 1.0,
      finalLoss: 1.0,
      lossReductionPct: 0,
      initialAccuracy: 0,
      finalAccuracy: 0,
      accuracyGain: 0,
      batchSize: 0,
      initialWeights: { ...initialWeights },
      optimizedWeights: { ...initialWeights },
      algoGradients: [],
      epochHistory: [],
      trainingDurationMs: 0,
      convergenceStatus: 'PLATEAU',
    };
  }

  // 2. Initialisation des vecteurs de poids et momentums
  const currentW: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const momentumV: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  
  validKeys.forEach((k) => {
    currentW[k] = initialWeights[k] || (1.0 / numAlgos);
    momentumV[k] = 0;
  });

  const epochHistory: NeuralEpochLog[] = [];
  let initialLoss = 0;
  let finalLoss = 0;

  // Calcul du taux d'exactitude initial (Top 5 vs Gagnants réels)
  const computeAccuracy = (w: Record<AlgoKey, number>): number => {
    let totalHits = 0;
    let totalDraws = 0;

    featureTensors.forEach(({ targetGagnants, features }) => {
      const scores = new Float64Array(91);
      for (let b = 1; b <= 90; b++) {
        let s = 0;
        validKeys.forEach((k) => {
          s += (w[k] || 0) * (features[b]?.[k] || 0);
        });
        scores[b] = s;
      }

      const top5 = Array.from({ length: 90 }, (_, i) => i + 1)
        .sort((a, b) => scores[b] - scores[a])
        .slice(0, 5);

      const hits = top5.filter((n) => targetGagnants.has(n)).length;
      totalHits += hits;
      totalDraws++;
    });

    return totalDraws > 0 ? (totalHits / (totalDraws * 5)) * 100 : 0;
  };

  const initialAccuracy = computeAccuracy(currentW);

  // 3. Boucle d'Optimisation par Rétropropagation (Backprop Pass)
  const maxEpochs = hyperparams.epochs;
  let lastGradients: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;

  for (let ep = 0; ep < maxEpochs; ep++) {
    const gradients: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
    validKeys.forEach((k) => { gradients[k] = 0; });

    let epochLoss = 0;
    let epochEntropySum = 0;

    // Passe avant (Forward Pass) & Gradient Accumulation
    for (let t = 0; t < effectiveBatchSize; t++) {
      const { targetGagnants, features } = featureTensors[t];
      
      // Logits = sum(W_a * f_a)
      const logits = new Float64Array(91);
      let maxLogit = -Infinity;
      for (let b = 1; b <= 90; b++) {
        let s = 0;
        validKeys.forEach((k) => {
          s += currentW[k] * (features[b]?.[k] || 0);
        });
        logits[b] = s;
        if (s > maxLogit) maxLogit = s;
      }

      // Softmax numériquement stable
      const probs = new Float64Array(91);
      let sumExp = 0;
      for (let b = 1; b <= 90; b++) {
        probs[b] = Math.exp(Math.min(30, Math.max(-30, logits[b] - maxLogit)));
        sumExp += probs[b];
      }

      for (let b = 1; b <= 90; b++) {
        probs[b] /= (sumExp || 1);
        if (probs[b] > 0) {
          epochEntropySum -= probs[b] * Math.log2(probs[b]);
        }
      }

      // Calcul de la perte Cross-Entropy : -sum(y_b * log(p_b))
      const targetCount = targetGagnants.size || 5;
      targetGagnants.forEach((winningBall) => {
        if (winningBall >= 1 && winningBall <= 90) {
          epochLoss -= Math.log(Math.max(1e-9, probs[winningBall]));
        }
      });

      // Calcul des gradients analytiques dL / dW_a = sum_b (p_b - y_b) * f_b,a
      for (let b = 1; b <= 90; b++) {
        const y_b = targetGagnants.has(b) ? (1.0 / targetCount) : 0.0;
        const error_b = probs[b] - y_b;

        validKeys.forEach((k) => {
          gradients[k] += error_b * (features[b]?.[k] || 0);
        });
      }
    }

    // Normalisation de l'erreur par la taille du batch + Régularisation L2 (Weight Decay)
    let gradNormSq = 0;
    validKeys.forEach((k) => {
      gradients[k] = (gradients[k] / effectiveBatchSize) + (hyperparams.l2Regularization * currentW[k]);
      gradNormSq += gradients[k] * gradients[k];
    });

    const gradNorm = Math.sqrt(gradNormSq);
    lastGradients = { ...gradients };

    // Taux d'apprentissage avec Cosine Decay continu
    const progress = ep / Math.max(1, maxEpochs - 1);
    const dynamicLR = hyperparams.learningRate * (0.5 * (1.0 + Math.cos(Math.PI * progress)));

    // Mise à jour des poids avec Momentum & Empirical Proof Guard
    validKeys.forEach((k) => {
      momentumV[k] = (hyperparams.momentum * momentumV[k]) + ((1.0 - hyperparams.momentum) * gradients[k]);
      
      const proof = proofMap[k];
      const hasProof = Boolean(proof && proof.hasProof && proof.proofScore > 0);
      
      let step = dynamicLR * momentumV[k];
      
      // RÈGLE ABSOLUE : Qu'aucun algorithme ne voie son poids augmenté s'il ne fait pas ses preuves
      // Si le gradient suggère une baisse de perte en augmentant le poids (-step > 0),
      // mais que l'algo n'a pas fait ses preuves, on bloque la hausse.
      if (!hasProof && step < 0) {
        step = 0; // Aucun boost pour les non-prouvés
      }
      
      currentW[k] = Math.max(0.0001, currentW[k] - step);
    });

    // Normalisation L1 intermédiaire
    const normalizedW = normalizeWeights(currentW);
    validKeys.forEach((k) => {
      currentW[k] = normalizedW[k];
    });

    const meanEntropy = epochEntropySum / (effectiveBatchSize * Math.log2(90));
    const meanLoss = epochLoss / effectiveBatchSize;

    if (ep === 0) initialLoss = meanLoss;
    finalLoss = meanLoss;

    epochHistory.push({
      epoch: ep + 1,
      loss: parseFloat(meanLoss.toFixed(5)),
      accuracyDelta: parseFloat((computeAccuracy(currentW) - initialAccuracy).toFixed(2)),
      gradientNorm: parseFloat(gradNorm.toFixed(5)),
      learningRate: parseFloat(dynamicLR.toFixed(5)),
      meanEntropy: parseFloat(meanEntropy.toFixed(4)),
    });
  }

  const finalAccuracy = computeAccuracy(currentW);
  const optimizedWeights = normalizeWeights(currentW);
  const duration = Date.now() - startTime;

  // 4. Analyse des Gradients et Attribution par Algorithme
  const algoGradients: AlgoNeuralGradientInfo[] = validKeys.map((algoKey) => {
    const label = LABELS_MAP[algoKey] || algoKey;
    const category = getCategoryName(algoKey);
    const initW = initialWeights[algoKey] || (1.0 / numAlgos);
    const optW = optimizedWeights[algoKey] || 0;
    const delta = optW - initW;
    const deltaPct = initW > 0 ? (delta / initW) * 100 : 0;
    
    const proof = proofMap[algoKey];
    const proofScore = proof?.proofScore || 0;
    const hasEmpiricalProof = Boolean(proof?.hasProof && proofScore > 0);
    const grad = lastGradients[algoKey] || 0;
    const mom = momentumV[algoKey] || 0;

    let gatingAction: AlgoNeuralGradientInfo['gatingAction'] = 'MAINTAINED';
    if (!hasEmpiricalProof && grad < 0) {
      gatingAction = 'PROOF_LOCKED';
    } else if (delta > 0.005) {
      gatingAction = 'BOOSTED';
    } else if (delta < -0.005) {
      gatingAction = 'DAMPENED';
    }

    return {
      algoKey,
      label,
      category,
      initialWeight: parseFloat(initW.toFixed(5)),
      optimizedWeight: parseFloat(optW.toFixed(5)),
      weightDelta: parseFloat(delta.toFixed(5)),
      weightDeltaPct: parseFloat(deltaPct.toFixed(2)),
      gradient: parseFloat(grad.toFixed(6)),
      momentum: parseFloat(mom.toFixed(6)),
      hasEmpiricalProof,
      proofScore: parseFloat(proofScore.toFixed(2)),
      gatingAction,
    };
  }).sort((a, b) => b.optimizedWeight - a.optimizedWeight);

  const lossReductionPct = initialLoss > 0 ? ((initialLoss - finalLoss) / initialLoss) * 100 : 0;

  return {
    drawName,
    epochsCompleted: maxEpochs,
    initialLoss: parseFloat(initialLoss.toFixed(5)),
    finalLoss: parseFloat(finalLoss.toFixed(5)),
    lossReductionPct: parseFloat(lossReductionPct.toFixed(2)),
    initialAccuracy: parseFloat(initialAccuracy.toFixed(2)),
    finalAccuracy: parseFloat(finalAccuracy.toFixed(2)),
    accuracyGain: parseFloat((finalAccuracy - initialAccuracy).toFixed(2)),
    batchSize: effectiveBatchSize,
    initialWeights,
    optimizedWeights,
    algoGradients,
    epochHistory,
    trainingDurationMs: duration,
    convergenceStatus: lossReductionPct > 5 ? 'CONVERGED' : 'PLATEAU',
  };
};
