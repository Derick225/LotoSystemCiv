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
 * Exposant de Lyapunov à temps fini (FTLE) — algorithme de Rosenstein.
 *
 * Mesure OBJECTIVE de la sensibilité aux conditions initiales à partir de la
 * série réelle des sommes de tirages : reconstruction de l'espace des phases
 * (dimension d'immersion m, retard tau), appariement de chaque vecteur à son
 * plus proche voisin (séparation temporelle minimale m pour écarter les faux
 * voisins autocorrélés), suivi de la divergence moyenne ln d(k), puis pente par
 * moindres carrés. λ > 0 ⇒ divergence exponentielle (régime chaotique).
 *
 * 100 % déterministe, zéro nombre magique : m et tau sont des paramètres
 * structurels de reconstruction, la pente est extraite des données. Retourne
 * NaN lorsque la série est trop courte (< 8 vecteurs reconstruits) — le rendu
 * affiche alors "n/d" plutôt qu'une valeur inventée.
 */
const estimateFiniteTimeLyapunov = (
  sums: number[],
  m: number = 3,
  tau: number = 1
): number => {
  const M = sums.length;
  const numVectors = M - (m - 1) * tau;
  if (numVectors < 8) return NaN;

  // Reconstruction de l'espace des phases
  const vectors: number[][] = [];
  for (let i = 0; i < numVectors; i++) {
    const v: number[] = new Array(m);
    for (let d = 0; d < m; d++) v[d] = sums[i + d * tau];
    vectors.push(v);
  }

  const dist = (a: number[], b: number[]): number => {
    let s = 0;
    for (let d = 0; d < m; d++) {
      const diff = a[d] - b[d];
      s += diff * diff;
    }
    return Math.sqrt(s);
  };

  // Plus proche voisin avec séparation temporelle minimale m (Rosenstein)
  const nn: number[] = new Array(numVectors).fill(-1);
  for (let i = 0; i < numVectors; i++) {
    let bestJ = -1;
    let bestD = Infinity;
    for (let j = 0; j < numVectors; j++) {
      if (Math.abs(i - j) < m) continue;
      const dd = dist(vectors[i], vectors[j]);
      if (dd > 0 && dd < bestD) {
        bestD = dd;
        bestJ = j;
      }
    }
    nn[i] = bestJ;
  }

  // Divergence moyenne ln d(k) sur k pas de temps
  const maxK = Math.min(numVectors - m, 12);
  const lnD: number[] = [];
  for (let k = 1; k <= maxK; k++) {
    let acc = 0;
    let cnt = 0;
    for (let i = 0; i < numVectors; i++) {
      const j = nn[i];
      if (j < 0 || i + k >= numVectors || j + k >= numVectors) continue;
      const dd = dist(vectors[i + k], vectors[j + k]);
      if (dd <= 0) continue;
      acc += Math.log(dd);
      cnt++;
    }
    if (cnt > 0) lnD.push(acc / cnt);
  }

  if (lnD.length < 2) return NaN;

  // Pente par moindres carrés de ln d(k) vs k
  const nk = lnD.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let idx = 0; idx < nk; idx++) {
    const x = idx + 1;
    const y = lnD[idx];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denom = nk * sumXX - sumX * sumX;
  if (denom === 0) return NaN;
  return (nk * sumXY - sumX * sumY) / denom;
};

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

  // Exposant de Lyapunov GLOBAL (FTLE de Rosenstein) mesuré sur la série réelle des
  // sommes de tirages, réordonnée du plus ancien au plus récent (purifyHistoryForDraw
  // renvoie le plus récent en index 0). Une seule estimation, partagée par tous les
  // points : c'est une propriété dynamique de la série, pas une métrique par fenêtre.
  const drawSums = pureHistory.map((d) => (d.gagnants || []).reduce((a, b) => a + b, 0));
  const chronologicalSums = drawSums.slice().reverse();
  const globalLyapunov = estimateFiniteTimeLyapunov(chronologicalSums, 3, 1);

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

    // Canal MARKOV réel : probabilité de présence-transition lissée de Laplace (add-one).
    // P(i ∈ tirage suivant | i ∈ tirage courant) = (transCount[i] + 1) / (presentCount[i] + 2).
    // pastSubset est ordonné du plus récent au plus ancien : (pastSubset[t+1] → pastSubset[t])
    // forme un couple chronologique (ancien → nouveau).
    const markovTrans = new Float64Array(91);
    const markovPresent = new Float64Array(91);
    for (let t = 0; t < numPast - 1; t++) {
      const newer = pastSubset[t];
      const older = pastSubset[t + 1];
      const olderSet = new Set<number>();
      (older.gagnants || []).forEach((n) => {
        if (n >= 1 && n <= 90) {
          olderSet.add(n);
          markovPresent[n]++;
        }
      });
      (newer.gagnants || []).forEach((n) => {
        if (n >= 1 && n <= 90 && olderSet.has(n)) markovTrans[n]++;
      });
    }

    // Canal AFFINITÉ réel : co-occurrence avec R, le tirage passé le plus récent
    // (pastSubset[0], adjacent à la cible). affinity[i] = Σ_{j∈R} coCount(i, j) sur la
    // fenêtre, normalisé par le maximum observé ⇒ [0, 1].
    const anchorSet = new Set<number>();
    (pastSubset[0]?.gagnants || []).forEach((n) => {
      if (n >= 1 && n <= 90) anchorSet.add(n);
    });
    const affinityRaw = new Float64Array(91);
    let maxAffinity = 0;
    for (let t = 0; t < numPast; t++) {
      const nums: number[] = [];
      (pastSubset[t].gagnants || []).forEach((n) => {
        if (n >= 1 && n <= 90) nums.push(n);
      });
      const rowSet = new Set(nums);
      nums.forEach((i) => {
        let c = 0;
        anchorSet.forEach((j) => {
          if (j !== i && rowSet.has(j)) c++;
        });
        affinityRaw[i] += c;
      });
    }
    for (let i = 1; i <= 90; i++) {
      if (affinityRaw[i] > maxAffinity) maxAffinity = affinityRaw[i];
    }

    const totalAlgoKeys = Object.keys(globalWeights).length || 1;
    const uniformFallback = 1.0 / totalAlgoKeys;
    const wFreq = globalWeights[AlgoKey.FREQUENCY] ?? uniformFallback;
    const wGaps = globalWeights[AlgoKey.GAPS] ?? uniformFallback;
    const wMarkov = globalWeights[AlgoKey.MARKOV] ?? uniformFallback;
    const wAffinity = globalWeights[AlgoKey.AFFINITY] ?? uniformFallback;

    // Intervalle de récurrence THÉORIQUE d'un numéro : 90 numéros / 5 tirés = 18 tirages
    // (inverse de la probabilité d'apparition 5/90). Ancrage dérivé, non arbitraire, qui
    // remplace le facteur de décroissance magique /8.0.
    const theoreticalRecurrence = maxBalls / 5; // 18

    // Les 4 canaux sont normalisés sur [0, 1] avant pondération (AGENTS.md #1 : pas de
    // constante arbitraire type ×0.5+0.01 ou ×0.05 ; chaque canal est une statistique réelle).
    for (let i = 1; i <= 90; i++) {
      const freqChan = freq[i] / numPast;
      const gapsChan = Math.exp(-Math.max(0, lastSeen[i]) / theoreticalRecurrence);
      const markovChan = (markovTrans[i] + 1) / (markovPresent[i] + 2);
      const affinityChan = maxAffinity > 0 ? affinityRaw[i] / maxAffinity : 0;
      qScores[i] =
        (wFreq * freqChan) +
        (wGaps * gapsChan) +
        (wMarkov * markovChan) +
        (wAffinity * affinityChan);
    }

    // Softmax SCALE-INVARIANT : z-score des canaux puis exponentielle. Le z-score est
    // borné par √(N-1) = √89 ≈ 9.43, donc exp(z) ne déborde jamais — plus besoin du
    // clamp arbitraire ±20 couplé au facteur ×10. std nul (distribution uniforme) ⇒ Q uniforme.
    let qMean = 0;
    for (let i = 1; i <= 90; i++) qMean += qScores[i];
    qMean /= 90;
    let qVar = 0;
    for (let i = 1; i <= 90; i++) {
      const dv = qScores[i] - qMean;
      qVar += dv * dv;
    }
    const qStd = Math.sqrt(qVar / 90);

    const expScores = new Float64Array(91);
    let sumExp = 0;
    for (let i = 1; i <= 90; i++) {
      const z = qStd > 0 ? (qScores[i] - qMean) / qStd : 0;
      expScores[i] = Math.exp(z);
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

    // 4. Sensibilité dynamique : canal Lyapunov CONTINU dérivé du FTLE global réel.
    // tanh borne λ ∈ ℝ sur (-1, 1) ; on retient la partie positive (divergence), donc
    // lyapChan ∈ [0, 1]. NaN (série trop courte) ⇒ canal neutre à 0, jamais une valeur inventée.
    const lyapChan = Number.isFinite(globalLyapunov)
      ? Math.max(0, Math.tanh(globalLyapunov))
      : 0;

    // 5. Score Composite d'Imprévisibilité (0 à 100) — moyenne NORMALISÉE de trois canaux
    // bornés sur [0, 1] (AGENTS.md #1 : plus de pondérations arbitraires ×45/×15/×40) :
    //  - hChan  : entropie de Shannon normalisée du tirage réel (dispersion observée)
    //  - klChan : divergence KL normalisée par log2(90), le max théorique pour 90 symboles
    //  - lyapChan : sensibilité dynamique (FTLE)
    const hChan = normH_P;
    const klChan = Math.min(1.0, safeDKL / log2Max);
    const unpredictabilityScore = parseFloat(
      (100 * (hChan + klChan + lyapChan) / 3).toFixed(1)
    );

    // 6. Détermination du Régime
    let regime: UnpredictabilityRegime = 'TRANSITIONAL_STOCHASTIC';
    let regimeLabel = 'Régime Transitionnel';

    // Coordonnée de régime CONTINUE : le score composite est déjà borné sur [0,100] par
    // construction (moyenne de 3 canaux ∈ [0,1] × 100). On coupe directement aux TERTILES
    // du domaine plutôt qu'aux seuils arbitraires 38/62/1.2/2.5 (AGENTS.md règle #1).
    // L'étiquette reste catégorielle (lisible), mais ses frontières dérivent de l'échelle réelle.
    const regimeCoordinate = unpredictabilityScore;
    const lowTertile = 100.0 / 3.0;
    const highTertile = 200.0 / 3.0;

    if (regimeCoordinate < lowTertile) {
      regime = 'LOW_ENTROPY_ATTRACTOR';
      regimeLabel = 'Attracteur à Basse Entropie (Haute Cohérence)';
    } else if (regimeCoordinate > highTertile) {
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
      lyapunovExponent: Number.isFinite(globalLyapunov)
        ? parseFloat(globalLyapunov.toFixed(4))
        : NaN,
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

  const n = timeline.length;
  const currentPoint = timeline[0];

  const highCount = timeline.filter((p) => p.regime === 'HIGH_ENTROPY_DIFFUSION').length;
  const lowCount = timeline.filter((p) => p.regime === 'LOW_ENTROPY_ATTRACTOR').length;

  // Recommandation stratégique (texte qualitatif piloté par le régime courant)
  let recommendedStrategy = 'Équilibrage adaptatif standard avec conservation des sous-algorithmes prouvés.';
  const currentRegime: UnpredictabilityRegime = currentPoint?.regime ?? 'TRANSITIONAL_STOCHASTIC';

  if (currentRegime === 'LOW_ENTROPY_ATTRACTOR') {
    recommendedStrategy = 'Basse entropie détectée : Activer les modèles d\'attracteurs périodiques et renforcer les poids des cycles Markoviens et fréquences chaudes.';
  } else if (currentRegime === 'HIGH_ENTROPY_DIFFUSION') {
    recommendedStrategy = 'Haute entropie et divergence KL élevée : Réduire l\'agressivité des scores de tête, prioriser l\'Inertie/Volatilité et injecter un lissage de dispersion.';
  }

  // Indice de Cohérence : confiance CONTINUE et MESURÉE dans la classification du régime
  // courant — plus une constante inventée (75/88/82). Produit de deux facteurs réels bornés
  // sur [0,1] (AGENTS.md #1 zéro nombre magique, #3 continuité, doctrine d'honnêteté) :
  //  - séparation : distance de la coordonnée de régime au TERTILE le plus proche, réduite
  //    par la demi-largeur de bande (50/3, issue de la géométrie des tertiles). Nulle sur une
  //    frontière (classement ambigu), saturée à 1 au cœur d'une bande (classement net).
  //  - fiabilité d'échantillonnage : 1 - 1/√n (marge d'erreur standard qui se réduit avec le
  //    nombre de tirages analysés). Aucune donnée ⇒ NaN, rendu "n/d" côté panneau.
  let currentUnpredictabilityScore = NaN;
  let confidence = NaN;
  if (n > 0 && currentPoint) {
    currentUnpredictabilityScore = currentPoint.unpredictabilityScore;

    const lowTertile = 100.0 / 3.0;
    const highTertile = 200.0 / 3.0;
    const bandHalfWidth = 50.0 / 3.0;
    // Coordonnée de régime du point courant, identique à la boucle : le score composite
    // est déjà borné sur [0,100], on le compare directement aux tertiles.
    const regimeCoordinate = currentPoint.unpredictabilityScore;
    const boundaryDistance = Math.min(
      Math.abs(regimeCoordinate - lowTertile),
      Math.abs(regimeCoordinate - highTertile)
    );
    const separation = Math.min(1.0, boundaryDistance / bandHalfWidth);
    const reliability = 1.0 - 1.0 / Math.sqrt(n);
    confidence = Math.round(Math.max(0, Math.min(100, 100 * separation * reliability)));
  }

  return {
    drawName,
    meanDrawEntropy: parseFloat(meanDrawEntropy.toFixed(4)),
    meanPredictionEntropy: parseFloat(meanPredictionEntropy.toFixed(4)),
    meanKLDivergence: parseFloat(meanKLDivergence.toFixed(4)),
    meanLyapunovExponent: parseFloat(meanLyapunovExponent.toFixed(4)),
    currentUnpredictabilityScore,
    currentRegime,
    highUnpredictabilityPeriodsCount: highCount,
    lowUnpredictabilityPeriodsCount: lowCount,
    timeline,
    predictabilityResonanceWindow: {
      recommendedStrategy,
      confidence,
    },
  };
};
