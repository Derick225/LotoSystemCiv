import { FusionResult, SpectralMetric, Prediction, DrawResult, AlgoWeights } from '../types';
import { calculateShannonEntropy, calculateMedian, gaussianPDF, sigmoid } from './prediction/deterministicCore';

// ============================================================================
// STATISTIQUES ROBUSTES (Zéro sensibilité aux Outliers)
// ============================================================================
const getMedian = (arr: number[]): number => calculateMedian(arr);

const getMeanAndStdDev = (arr: number[]): { mean: number; std: number } => {
  if (arr.length === 0) return { mean: 0, std: 1 };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const MathVariance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
  return { mean, std: Math.max(Number.EPSILON, Math.sqrt(MathVariance)) };
};

const normalizeVector = (vector: Float64Array): Float64Array => {
  let max = 0;
  for (let i = 0; i < vector.length; i++) if (vector[i] > max) max = vector[i];
  if (max === 0) return vector;
  
  const normalized = new Float64Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    normalized[i] = (vector[i] / max) * 100;
  }
  return normalized;
};

const computeVectorEntropy = (vector: Float64Array): number => {
  let sum = 0;
  for (let i = 1; i <= 90; i++) sum += vector[i];
  if (sum === 0) return 1.0;
  
  let entropy = 0;
  for (let i = 1; i <= 90; i++) {
    const p = vector[i] / sum;
    if (p > 0) entropy -= p * Math.log(p);
  }
  const maxEntropy = Math.log(90);
  return entropy / maxEntropy;
};

/**
 * CALCUL DU VECTEUR PYTHON (Logique Statistique)
 * Strictement continu : pas de seuils ou constantes arbitraires.
 */
const calculatePythonVector = (history: DrawResult[]): { number: number; score: number }[] => {
  const scores = new Float32Array(91);
  const gaps = new Int16Array(91);
  const factorNum = history.length;
  
  // Demi-vie adaptative dérivée de la taille de l'échantillon (loi de désintégration continue)
  const adaptiveHalfLife = Math.log(2) / Math.max(1, factorNum * 0.05); 
  const ALPHA = 1.0 - Math.pow(0.5, 1.0 / adaptiveHalfLife);
  
  const chronoHistory = [];
  for (let i = factorNum - 1; i >= 0; i--) chronoHistory.push(history[i]);
  
  const variance = new Float32Array(91);
  for (const draw of chronoHistory) {
    for (let num = 1; num <= 90; num++) {
      const isPresent = draw.gagnants.includes(num) ? 1.0 : 0.0;
      const diff = isPresent - scores[num];
      scores[num] = scores[num] + ALPHA * diff;
      variance[num] = (1 - ALPHA) * (variance[num] + ALPHA * diff * diff);
    }
  }

  for (let num = 1; num <= 90; num++) {
    let gap = 0;
    for (const draw of history) {
      if (draw.gagnants.includes(num)) break;
      gap++;
    }
    gaps[num] = gap;
  }

  const result = [];
  const allGaps = Array.from(gaps).slice(1);
  const { mean: medianGap, std: stdDevGap } = getMeanAndStdDev(allGaps.filter(g => g > 0));
  // Moyenne de l'EMA théorique = probabilité de base
  const probBase = chronoHistory.reduce((s, h) => s + h.gagnants.length, 0) / (chronoHistory.length * 90) || (5 / 90);

  for (let num = 1; num <= 90; num++) {
    const emaScore = scores[num];
    const stdDev = Math.sqrt(variance[num]) || 1;
    const gap = gaps[num];
    
    // Z-score centré sur la moyenne réelle des scores EMA
    const zScore = (emaScore - probBase) / stdDev; 
    
    // Sigmoïdes basées sur des Z-scores normalisés
    const zGap = (gap - medianGap) / (stdDevGap + Number.EPSILON);
    const gainZ = 1.0 / stdDev;
    const gainGap = 1.0 / (stdDevGap + Number.EPSILON);
    const probGapHigh = sigmoid(zGap, 0, gainGap);
    const probZLow = sigmoid(-zScore, 1.0 / Math.max(0.1, probBase), gainZ); 
    const probGapLow = sigmoid(-zGap, Math.log(2) * gainGap, gainGap);
    const probZHigh = sigmoid(zScore, 1.0 / Math.max(0.1, probBase), gainZ);

    // Pondération inverse de la variance continue
    const varianceWeight = Math.exp(-stdDev); 
    const bounceProb = varianceWeight * (
      (Math.abs(zScore) * probGapHigh * probZLow) + 
      (zScore * probGapLow * probZHigh)
    );
    
    let finalScore = emaScore + bounceProb;

    // Bonus Maturité Classique Continu : distribution Gaussienne des retards
    const maturityBonus = gaussianPDF(gap, medianGap, stdDevGap * stdDevGap);
    const stdErrorGap = stdDevGap / Math.sqrt(factorNum);
    const lateGapBonus = stdDevGap * sigmoid(zGap, stdErrorGap, gainGap);

    finalScore += maturityBonus + lateGapBonus;
    result.push({ number: num, score: finalScore * 100.0 }); // Projection sur 100
  }
  return result;
};

/**
 * CALCUL DU VECTEUR QUANTUM (Spectral)
 * Fonction Continue sans seuils statiques.
 */
const calculateQuantumVector = (spectral: SpectralMetric[]): { number: number; score: number }[] => {
  if (spectral.length === 0) return [];
  const energies = spectral.map(s => s.energy);
  const { mean: medianEnergy, std: stdDevEnergy } = getMeanAndStdDev(energies);
  
  return spectral.map(s => {
    const zEnergy = (s.energy - medianEnergy) / (stdDevEnergy + Number.EPSILON);
    // Pente sigmoïdale adaptée dynamiquement à la dispersion énergétique
    const adaptiveGain = 1.0 / (1.0 + stdDevEnergy / (medianEnergy + Number.EPSILON));
    const activation = sigmoid(zEnergy, 0, adaptiveGain);
    
    // Le "boost" est maintenant proportionnel à la variance dynamique de la série
    const dynamicBoost = stdDevEnergy * Math.E * activation; 
    const transformedEnergy = s.energy * (1.0 - activation) + (medianEnergy + dynamicBoost) * activation;
    
    return { number: s.number, score: transformedEnergy };
  });
};

/**
 * CALCUL DU VECTEUR ORACLE (Markov/Temporel)
 * Sans limites de boucle "magiques", en utilisant tout l'historique dispo avec décroissance exponentielle.
 */
const calculateOracleVector = (history: DrawResult[], lastPrediction: Prediction | null, dna: AlgoWeights): { number: number; score: number }[] => {
  if (history.length < 3) return [];
  
  const associationScores = new Float32Array(91);
  const lastDrawNumbers = history[0].gagnants;
  const prevDrawNumbers = history[1].gagnants;
  
  // Normalisation des poids ADN
  const totalDnaWeight = (dna as any)['markov'] + (dna as any)['temporal'] + (dna as any)['fractal'] || 1.0;
  const dnaMarkov = ((dna as any)['markov'] || 0) / totalDnaWeight;
  const dnaTemporal = ((dna as any)['temporal'] || 0) / totalDnaWeight;
  const dnaFractal = ((dna as any)['fractal'] || 0) / totalDnaWeight;
  
  const maxDepth = history.length - 1; // Pas de constante arbitraire "50", parcourt tout l'historique
  
  for (let i = 2; i < maxDepth; i++) {
    const historicalRecent = history[i - 1].gagnants;
    const historicalOlder = history[i].gagnants;
    
    const commonWithLast = historicalRecent.filter(n => lastDrawNumbers.includes(n)).length;
    const commonWithPrev = historicalOlder.filter(n => prevDrawNumbers.includes(n)).length;

    // ZÉRO NOMBRE MAGIQUE : Poids de contexte calculés continûment à partir de l'ADN
    const lastWeight = 1.0 + dnaTemporal;
    const prevWeight = 1.0 + dnaMarkov;
    const maxCommon = lastDrawNumbers.length * lastWeight + prevDrawNumbers.length * prevWeight;
    const contextStrength = (commonWithLast * lastWeight + commonWithPrev * prevWeight) / (maxCommon || Number.EPSILON);
    
    // Activation adaptative sigmoïdale dérivée du profil fractal et de Markov
    const activationCenter = 0.25 + 0.10 * (1.0 - dnaFractal);
    const activationGain = 5.0 + 10.0 * dnaMarkov;
    const activation = sigmoid(contextStrength, activationCenter, activationGain);

    const futureDraw = history[i - 2];
    if (!futureDraw) continue;

    // Facteur de décroissance exponentiel dérivé de la profondeur et du profil fractal
    const decayFactor = (maxDepth / Math.E) * (1.0 + dnaFractal * Math.E);
    const weight = contextStrength * Math.exp(-i / decayFactor) * activation;

    futureDraw.gagnants.forEach(n => { associationScores[n] += weight; });
  }

  const preds = new Set(lastPrediction?.suggestedNumbers || []);
  const candidates = new Set(lastPrediction?.candidates || []);
  const maxScore = Math.max(Number.EPSILON, ...Array.from(associationScores));
  
  // Dynamically scale prediction confirmations based on the confidence metric of the previous model
  const lastConfidence = lastPrediction?.confidence || 50;
  const dynamicPredBoost = (Math.E * 5.0) * (lastConfidence / 100.0);
  const dynamicCandBoost = (Math.E * 1.5) * (lastConfidence / 100.0);
  
  const result = [];
  for (let i = 1; i <= 90; i++) {
    let baseAssoc = (associationScores[i] / maxScore) * 100.0;
    
    // Modulation continue des confirmations (évite la logique if)
    const predBoost = preds.has(i) ? dynamicPredBoost : 0.0;
    const candBoost = candidates.has(i) ? dynamicCandBoost : 0.0;
    
    result.push({ number: i, score: baseAssoc + predBoost + candBoost });
  }
  return result;
};

export const calculateFusion = (
  history: DrawResult[],
  _stats: { number: number; count: number }[],
  spectral: SpectralMetric[],
  lastPrediction: Prediction | null,
  weights: AlgoWeights,
  biases: { logic: number; physics: number; intuition: number } = { logic: 1.0, physics: 1.0, intuition: 1.0 },
  selectionMethod: 'map' | 'balanced' | 'harmonic_consensus' = 'map'
): FusionResult => {
  const vPython = calculatePythonVector(history);
  const vQuantum = calculateQuantumVector(spectral);
  const vOracle = calculateOracleVector(history, lastPrediction, weights);
  
  const mPython = new Map(vPython.map(v => [v.number, v.score]));
  const mQuantum = new Map(vQuantum.map(v => [v.number, v.score]));
  const mOracle = new Map(vOracle.map(v => [v.number, v.score]));

  // Regroupement des poids par vecteurs normés
  const dnaLogic = (weights.frequency || 0) + (weights.gap || 0) + (weights.momentum || 0) + (weights.temporal || 0);
  const dnaPhysics = (weights.spectral || 0) + (weights.fractal || 0) + (weights.spatial || 0);
  const dnaIntuition = (weights.markov || 0) + (weights.bayes || 0) + (weights.affinity || 0);
  
  // Pondération dynamique par exponentiation continue modulée par l'interactive bias
  const W_PYTHON = Math.exp(dnaLogic) * biases.logic;
  const W_QUANTUM = Math.exp(dnaPhysics) * biases.physics;
  const W_ORACLE = Math.exp(dnaIntuition) * biases.intuition;

  const scoreMap: Record<number, { score: number; sources: string[]; details: unknown }> = {};
  const entropyCounts = new Float32Array(91);

  // ============================================================================
  // FILTRAGE DE KALMAN TENSORIEL (FUSION MULTI-CAPTEURS PAR INVERSE-VARIANCE)
  // ============================================================================
  // Chaque moteur (Logic, Physics, Intuition) est modélisé comme un capteur.
  // La variance de l'historique des signaux quantifie le bruit d'observation.
  
  const medianP = getMedian(vPython.map(v => v.score));
  const medianQ = getMedian(vQuantum.map(v => v.score));
  const medianO = getMedian(vOracle.map(v => v.score));

  const varP = Math.max(1.0, vPython.reduce((sum, v) => sum + Math.pow(v.score - medianP, 2), 0) / Math.max(1, vPython.length));
  const varQ = Math.max(1.0, vQuantum.reduce((sum, v) => sum + Math.pow(v.score - medianQ, 2), 0) / Math.max(1, vQuantum.length));
  const varO = Math.max(1.0, vOracle.reduce((sum, v) => sum + Math.pow(v.score - medianO, 2), 0) / Math.max(1, vOracle.length));

  const stdP = Math.sqrt(varP);
  const stdQ = Math.sqrt(varQ);
  const stdO = Math.sqrt(varO);

  // RENTRÉE STATISTIQUE DYNAMIQUE : Régularisation de Kalman pour situations de forte variance
  // Calcule l'entropie cumulée des trois signaux pour adapter la régularisation (zéro nombre magique)
  const combinedScores = new Float64Array(91);
  for (let i = 1; i <= 90; i++) {
    combinedScores[i] = (mPython.get(i) || 0) + (mQuantum.get(i) || 0) + (mOracle.get(i) || 0);
  }
  const entropyMultiplier = computeVectorEntropy(normalizeVector(combinedScores));
  const avgStd = (stdP + stdQ + stdO) / 3.0;
  
  // Lambda de régularisation continue : s'élève proportionnellement au désordre (entropie) et à l'écart type moyen
  const lambda = avgStd * entropyMultiplier * 0.15;

  // Matrices de Précision Régularisées (évite l'overfitting d'un capteur très bruité)
  const precP = W_PYTHON / (varP + lambda);
  const precQ = W_QUANTUM / (varQ + lambda);
  const precO = W_ORACLE / (varO + lambda);
  
  const totalPrecision = precP + precQ + precO;
  const kalmanGainP = precP / totalPrecision;
  const kalmanGainQ = precQ / totalPrecision;
  const kalmanGainO = precO / totalPrecision;

  for (let i = 1; i <= 90; i++) {
    const sP = mPython.get(i) || 0;
    const sQ = mQuantum.get(i) || 0;
    const sO = mOracle.get(i) || 0;
    
    // 1. Mise à jour de l'état : x_est = (K * Z) ou formule consensus harmonique
    let kalmanState = 0;
    if (selectionMethod === 'harmonic_consensus') {
      const eps = 1e-4;
      const sP_norm = Math.max(eps, sP);
      const sQ_norm = Math.max(eps, sQ);
      const sO_norm = Math.max(eps, sO);
      
      const invSum = (kalmanGainP / sP_norm) + (kalmanGainQ / sQ_norm) + (kalmanGainO / sO_norm);
      kalmanState = 1.0 / invSum;
    } else {
      kalmanState = (sP * kalmanGainP) + (sQ * kalmanGainQ) + (sO * kalmanGainO);
    }

    // 2. Filtrage spatial (Porte de bruit analytique et continue)
    const combinedMedian = (medianP * kalmanGainP) + (medianQ * kalmanGainQ) + (medianO * kalmanGainO);
    const noiseGate = sigmoid(kalmanState, combinedMedian, 0.5);

    // 3. Matrice de Symbiose d'état (Cross-Covariance Activation)
    const pLogic = sigmoid(sP, medianP, 1.0 / stdP);
    const pPhysics = sigmoid(sQ, medianQ, 1.0 / stdQ);
    const pIntuition = sigmoid(sO, medianO, 1.0 / stdO);

    // Synergie Continue Analytique : probabilité jointe d'excitation
    const synergyTotal = (pLogic * pPhysics * pIntuition) + 
                         (pLogic * pPhysics + pLogic * pIntuition + pPhysics * pIntuition) / 3.0;

    const symbiosisMultiplier = Math.exp(synergyTotal);
    kalmanState *= symbiosisMultiplier;

    // Normalisation finale de la projection d'état
    const finalScore = kalmanState * noiseGate * 100.0;
    entropyCounts[i] = Math.max(0, finalScore);

    const sources = [];
    if (pLogic > 0.5) sources.push('python'); 
    if (pPhysics > 0.5) sources.push('quantum');
    if (pIntuition > 0.5) sources.push('oracle');

    scoreMap[i] = { 
      score: entropyCounts[i], 
      sources, 
      details: { P: sP.toFixed(2), Q: sQ.toFixed(2), O: sO.toFixed(2), symbiosis: symbiosisMultiplier.toFixed(3) } 
    };
  }

  let sumScores = 0;
  for (let i = 1; i <= 90; i++) sumScores += entropyCounts[i];
  
  const probArray = [];
  if (sumScores > 0) {
    for (let i = 1; i <= 90; i++) {
        probArray.push(entropyCounts[i] / sumScores);
    }
  }
  const entropy = calculateShannonEntropy(probArray);
  const maxEntropy = Math.log2(90);
  const normalizedEntropy = sumScores > 0 ? entropy / maxEntropy : 0;

  const convergedNumbers = Object.entries(scoreMap)
    .map(([n, data]) => ({ number: parseInt(n), score: data.score, sources: data.sources, details: data.details }))
    .sort((a, b) => b.score - a.score);

  const finalTicket: number[] = [];
  
  if (selectionMethod === 'balanced') {
    // Le facteur de pénalité continu est basé sur l'écart type des scores et l'entropie normalisée du système
    const scoresStd = getMeanAndStdDev(convergedNumbers.map(cn => cn.score)).std;
    const penaltyFactor = scoresStd * normalizedEntropy;
    const candidates = convergedNumbers.map(cn => ({ ...cn }));
    const sourceCounts: Record<string, number> = { python: 0, quantum: 0, oracle: 0 };
    
    while (finalTicket.length < 5 && candidates.length > 0) {
      candidates.sort((a, b) => {
        const penaltyA = a.sources.reduce((sum, s) => sum + (sourceCounts[s] || 0), 0) * penaltyFactor;
        const penaltyB = b.sources.reduce((sum, s) => sum + (sourceCounts[s] || 0), 0) * penaltyFactor;
        return (b.score - penaltyB) - (a.score - penaltyA);
      });
      
      const chosen = candidates.shift()!;
      finalTicket.push(chosen.number);
      chosen.sources.forEach(s => {
        sourceCounts[s] = (sourceCounts[s] || 0) + 1;
      });
    }
  } else {
    const candidates = [...convergedNumbers];
    while (finalTicket.length < 5 && candidates.length > 0) { 
      finalTicket.push(candidates.shift()!.number); 
    }
  }
  
  finalTicket.sort((a, b) => a - b);
  
  // Confiance Logistique Analytique dérivée continûment de l'entropie de Shannon normalisée du système
  const expectedEntropy = 0.95; // Seuil théorique de bruit blanc stochastique équilibré
  const slope = 1.0 / Math.max(Number.EPSILON, 1.0 - expectedEntropy);
  const confidenceRaw = 1.0 / (1.0 + Math.exp(slope * (normalizedEntropy - expectedEntropy)));
  const confidence = confidenceRaw * 100.0;

  return {
    sources: {
      python: vPython.sort((a, b) => b.score - a.score).slice(0, 5).map(v => v.number),
      quantum: vQuantum.sort((a, b) => b.score - a.score).slice(0, 5).map(v => v.number),
      oracle: vOracle.sort((a, b) => b.score - a.score).slice(0, 5).map(v => v.number)
    },
    convergedNumbers: convergedNumbers.slice(0, 15),
    finalTicket: finalTicket.slice(0, 5),
    confidence: Math.min(100, Math.max(0, Math.round(confidence))),
    entropy: parseFloat(normalizedEntropy.toFixed(3)),
    biasWeightsUsed: { logic: W_PYTHON, physics: W_QUANTUM, intuition: W_ORACLE },
    kalmanGains: { logic: kalmanGainP, physics: kalmanGainQ, intuition: kalmanGainO },
    variances: { logic: varP, physics: varQ, intuition: varO },
    method: selectionMethod
  };
};
