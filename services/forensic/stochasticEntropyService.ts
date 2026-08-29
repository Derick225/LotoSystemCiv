import { DrawResult, ForensicReport } from '../../types';
import { AlgoKey, AlgoWeights } from '../../shared/prediction.types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';

export type UnpredictabilityRegime = 
  | 'LOW_ENTROPY_ATTRACTOR'      // Haute prévisibilité / structures harmoniques fortes
  | 'TRANSITIONAL_STOCHASTIC'    // Régime intermédiaire
  | 'HIGH_ENTROPY_DIFFUSION';    // Haute imprévisibilité / dispersion maximale

export interface StochasticEntropyPoint {
  drawId: string;
  drawDate: string;
  drawIndex: number;
  drawEntropy: number;          // H(P) : Entropie de Shannon normalisée du tirage réel (0 - 1)
  predictionEntropy: number;    // H(Q) : Entropie de Shannon de la distribution prédite par le moteur (0 - 1)
  crossEntropy: number;         // H(P, Q) : Entropie croisée
  klDivergence: number;         // D_KL(P || Q) : Divergence de Kullback-Leibler
  lyapunovExponent: number;     // Indice de sensibilité dynamique locale
  unpredictabilityScore: number;// Score composite (0 à 100)
  regime: UnpredictabilityRegime;
  regimeLabel: string;
  exactHits: number;            // Nombre de numéros trouvés
}

export interface StochasticEntropySummary {
  drawName: string;
  meanDrawEntropy: number;
  meanPredictionEntropy: number;
  meanKLDivergence: number;
  meanLyapunovExponent: number;
  currentUnpredictabilityScore: number;
  currentRegime: UnpredictabilityRegime;
  highUnpredictabilityPeriodsCount: number;
  lowUnpredictabilityPeriodsCount: number;
  timeline: StochasticEntropyPoint[];
  predictabilityResonanceWindow: {
    recommendedStrategy: string;
    confidence: number;
  };
}

/**
 * Calcule l'analyse médico-légale de l'entropie stochastique (H(P), H(Q), D_KL, Lyapunov)
 * de manière 100% déterministe et isolée par tirage.
 */
export const calculateStochasticEntropyForensics = (
  drawName: string,
  history: DrawResult[],
  reports: ForensicReport[] = [],
  globalWeights: AlgoWeights,
  windowSize: number = 15
): StochasticEntropySummary => {
  const pureHistory = purifyHistoryForDraw<DrawResult>(drawName, history);
  const reportsByDate = new Map<string, ForensicReport>();
  
  reports.forEach((rep) => {
    if (rep.id) reportsByDate.set(rep.id, rep);
    if (rep.drawResultId) reportsByDate.set(rep.drawResultId, rep);
    if (rep.date) reportsByDate.set(rep.date, rep);
  });

  const timeline: StochasticEntropyPoint[] = [];
  const maxBalls = 90;
  const log2Max = Math.log2(maxBalls); // ~6.49185

  // Calcul itératif glissant sur l'historique chronologique
  const depth = Math.min(pureHistory.length - 1, 45);

  for (let k = 0; k < depth; k++) {
    const targetDraw = pureHistory[k];
    const pastSubset = pureHistory.slice(k + 1);
    if (pastSubset.length < 3) continue;

    // 1. Distribution empirique locale du tirage réel P (lissé sur fenêtre glissante locale)
    const localSlice = pureHistory.slice(k, Math.min(pureHistory.length, k + windowSize));
    const pCounts = new Float64Array(91);
    let totalBalls = 0;
    localSlice.forEach((d) => {
      (d.gagnants || []).forEach((n) => {
        if (n >= 1 && n <= 90) {
          pCounts[n]++;
          totalBalls++;
        }
      });
    });

    // 2. Calcul du vecteur d'inférence analytique Q basé sur les sous-algorithmes canoniques
    const qScores = new Float64Array(91);
    const pastLen = Math.max(1, pastSubset.length);
    const numPast = Math.min(pastSubset.length, 30);
    
    // Fréquences historiques et récence
    const freq = new Float64Array(91);
    const lastSeen = new Int32Array(91).fill(999);
    for (let t = 0; t < numPast; t++) {
      const d = pastSubset[t];
      (d.gagnants || []).forEach((n) => {
        if (n >= 1 && n <= 90) {
          freq[n]++;
          if (lastSeen[n] === 999) lastSeen[n] = t;
        }
      });
    }

    const wFreq = globalWeights[AlgoKey.FREQUENCY] ?? 0.15;
    const wGaps = globalWeights[AlgoKey.GAPS] ?? 0.12;
    const wMarkov = globalWeights[AlgoKey.MARKOV] ?? 0.10;
    const wAffinity = globalWeights[AlgoKey.AFFINITY] ?? 0.08;

    for (let i = 1; i <= 90; i++) {
      const fNorm = freq[i] / numPast;
      const gNorm = Math.exp(-Math.max(0, lastSeen[i]) / 8.0);
      qScores[i] = (wFreq * fNorm) + (wGaps * gNorm) + (wMarkov * (fNorm * 0.5 + 0.01)) + (wAffinity * 0.05);
    }
    
    // Softmax de Q avec lissage laplacien
    const expScores = new Float64Array(91);
    let sumExp = 0;
    for (let i = 1; i <= 90; i++) {
      expScores[i] = Math.exp(Math.min(20, Math.max(-20, qScores[i] * 10)));
      sumExp += expScores[i];
    }

    const P = new Float64Array(91);
    const Q = new Float64Array(91);
    const eps = 1e-9;

    for (let i = 1; i <= 90; i++) {
      P[i] = totalBalls > 0 ? (pCounts[i] + eps) / (totalBalls + 90 * eps) : 1 / 90;
      Q[i] = (expScores[i] + eps) / (sumExp + 90 * eps);
    }

    // 3. Calculs d'Entropie de Shannon, Entropie Croisée & Divergence KL
    let H_P = 0;
    let H_Q = 0;
    let H_PQ = 0;
    let D_KL = 0;

    for (let i = 1; i <= 90; i++) {
      if (P[i] > 0) {
        H_P -= P[i] * Math.log2(P[i]);
        D_KL += P[i] * Math.log2(P[i] / Q[i]);
      }
      if (Q[i] > 0) {
        H_Q -= Q[i] * Math.log2(Q[i]);
      }
      if (P[i] > 0 && Q[i] > 0) {
        H_PQ -= P[i] * Math.log2(Q[i]);
      }
    }

    const normH_P = Math.min(1.0, Math.max(0.0, H_P / log2Max));
    const normH_Q = Math.min(1.0, Math.max(0.0, H_Q / log2Max));
    const safeDKL = Math.max(0, D_KL);

    // 4. Estimation de l'Exposant de Lyapunov Local
    const recentVariance = localSlice.length > 1
      ? localSlice.reduce((acc, d) => {
          const sum = (d.gagnants || []).reduce((a, b) => a + b, 0);
          return acc + Math.pow(sum - 227.5, 2);
        }, 0) / (localSlice.length * 5)
      : 100;
    const lyapunov = Math.log(1 + Math.sqrt(recentVariance) / 45.0) * (normH_P - 0.5);

    // 5. Score Composite d'Imprévisibilité (0 à 100)
    const unpredictabilityScore = parseFloat(
      Math.min(100, Math.max(0, (normH_P * 45) + (safeDKL * 15) + (Math.max(0, lyapunov) * 40))).toFixed(1)
    );

    // 6. Détermination du Régime
    let regime: UnpredictabilityRegime = 'TRANSITIONAL_STOCHASTIC';
    let regimeLabel = 'Régime Transitionnel';

    if (unpredictabilityScore < 38 && safeDKL < 1.2) {
      regime = 'LOW_ENTROPY_ATTRACTOR';
      regimeLabel = 'Attracteur à Basse Entropie (Haute Cohérence)';
    } else if (unpredictabilityScore > 62 || safeDKL > 2.5) {
      regime = 'HIGH_ENTROPY_DIFFUSION';
      regimeLabel = 'Diffusion Chaotique (Dispersion Maximale)';
    }

    // 7. Matches réels / Hits
    let exactHits = 0;
    const actualGagnants = targetDraw.gagnants || [];
    const rep = reportsByDate.get(targetDraw.id) || reportsByDate.get(targetDraw.date);
    if (rep) {
      if (Array.isArray(rep.matches)) {
        exactHits = rep.matches.filter((m) => m.errorType === 'Hit').length;
      } else if (typeof rep.matches === 'number') {
        exactHits = rep.matches;
      }
    } else {
      // Top 5 du score Q
      const top5 = Array.from({ length: 90 }, (_, i) => i + 1)
        .sort((a, b) => qScores[b] - qScores[a])
        .slice(0, 5);
      exactHits = actualGagnants.filter((n) => top5.includes(n)).length;
    }

    timeline.push({
      drawId: targetDraw.id,
      drawDate: targetDraw.date,
      drawIndex: k,
      drawEntropy: parseFloat(normH_P.toFixed(4)),
      predictionEntropy: parseFloat(normH_Q.toFixed(4)),
      crossEntropy: parseFloat(H_PQ.toFixed(4)),
      klDivergence: parseFloat(safeDKL.toFixed(4)),
      lyapunovExponent: parseFloat(lyapunov.toFixed(4)),
      unpredictabilityScore,
      regime,
      regimeLabel,
      exactHits,
    });
  }

  // Calcul des moyennes globales
  const count = Math.max(1, timeline.length);
  const meanDrawEntropy = timeline.reduce((s, p) => s + p.drawEntropy, 0) / count;
  const meanPredictionEntropy = timeline.reduce((s, p) => s + p.predictionEntropy, 0) / count;
  const meanKLDivergence = timeline.reduce((s, p) => s + p.klDivergence, 0) / count;
  const meanLyapunovExponent = timeline.reduce((s, p) => s + p.lyapunovExponent, 0) / count;

  const currentPoint = timeline[0] || {
    unpredictabilityScore: 50,
    regime: 'TRANSITIONAL_STOCHASTIC' as UnpredictabilityRegime,
  };

  const highCount = timeline.filter((p) => p.regime === 'HIGH_ENTROPY_DIFFUSION').length;
  const lowCount = timeline.filter((p) => p.regime === 'LOW_ENTROPY_ATTRACTOR').length;

  // Recommandation stratégique
  let recommendedStrategy = 'Équilibrage adaptatif standard avec conservation des sous-algorithmes prouvés.';
  let confidence = 75;

  if (currentPoint.regime === 'LOW_ENTROPY_ATTRACTOR') {
    recommendedStrategy = 'Basse entropie détectée : Activer les modèles d\'attracteurs périodiques et renforcer les poids des cycles Markoviens et fréquences chaudes.';
    confidence = 88;
  } else if (currentPoint.regime === 'HIGH_ENTROPY_DIFFUSION') {
    recommendedStrategy = 'Haute entropie et divergence KL élevée : Réduire l\'agressivité des scores de tête, prioriser l\'Inertie/Volatilité et injecter un lissage de dispersion.';
    confidence = 82;
  }

  return {
    drawName,
    meanDrawEntropy: parseFloat(meanDrawEntropy.toFixed(4)),
    meanPredictionEntropy: parseFloat(meanPredictionEntropy.toFixed(4)),
    meanKLDivergence: parseFloat(meanKLDivergence.toFixed(4)),
    meanLyapunovExponent: parseFloat(meanLyapunovExponent.toFixed(4)),
    currentUnpredictabilityScore: currentPoint.unpredictabilityScore,
    currentRegime: currentPoint.regime,
    highUnpredictabilityPeriodsCount: highCount,
    lowUnpredictabilityPeriodsCount: lowCount,
    timeline,
    predictabilityResonanceWindow: {
      recommendedStrategy,
      confidence,
    },
  };
};
