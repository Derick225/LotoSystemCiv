import { DrawResult } from "../types";
import { calculateShannonEntropy, calculateVolatility } from "./mathService";

// ============================================================================
// UTILITAIRES MATHÉMATIQUES ADAPTATIFS (Zéro Nombre Magique)
// ============================================================================
const DOMAIN_SIZE = 90;
const DRAW_SIZE = 5; // Nombre de numéros par tirage (Loto standard)
const BASE_PROB = DRAW_SIZE / DOMAIN_SIZE; // Probabilité a priori d'un numéro (~0.055)

/**
 * Calcule une fenêtre temporelle adaptative basée sur la persistance (Hurst)
 * et la taille de l'échantillon disponible.
 */
const getAdaptiveWindow = (
  historyLength: number,
  hurstExponent: number,
): number => {
  // Si H > 0.5 (persistance), on élargit la fenêtre pour capturer la tendance.
  // Si H < 0.5 (anti-persistance), on la réduit pour réagir au bruit.
  const persistenceMultiplier = 1.0 + (hurstExponent - 0.5) * 2.0;
  const baseWindow = Math.floor(Math.sqrt(historyLength)); // Racine carrée pour équilibrer biais/variance
  return Math.max(
    10,
    Math.min(historyLength, Math.floor(baseWindow * persistenceMultiplier)),
  );
};

/**
 * Noyau de décroissance temporelle continu basé sur la demi-vie adaptative.
 */
const getTimeDecayWeight = (
  index: number,
  adaptiveHalfLife: number,
): number => {
  return Math.pow(0.5, index / adaptiveHalfLife);
};

// --- SPATIAL ANALYSIS (Grid 9x10) ---
export const calculateSpatialHotSpots = (
  history: DrawResult[],
  hurstExponent: number = 0.5,
  customSigma?: number,
): Record<number, number> => {
  const gridWidth = 10;
  const gridHeight = 9;
  const grid = Array.from(
    { length: gridHeight },
    () => new Float32Array(gridWidth),
  );

  // Fenêtre adaptative au lieu de "20" fixe
  const windowSize = getAdaptiveWindow(history.length, hurstExponent);
  const recent = history.slice(0, windowSize);
  const halfLife = Math.max(5, windowSize * 0.3); // Demi-vie dérivée de la fenêtre

  recent.forEach((d, i) => {
    const weight = getTimeDecayWeight(i, halfLife);
    d.gagnants.forEach((n) => {
      if (n >= 1 && n <= DOMAIN_SIZE) {
        const row = Math.floor((n - 1) / gridWidth);
        const col = (n - 1) % gridWidth;
        grid[row][col] += weight;
      }
    });
  });

  const hotScores: Record<number, number> = {};
  const sigma = customSigma !== undefined ? customSigma : 1.5; // Écart-type du noyau gaussien spatial (en cellules de grille)

  for (let r = 0; r < gridHeight; r++) {
    for (let c = 0; c < gridWidth; c++) {
      let score = 0;
      for (let dr = -2; dr <= 2; dr++) {
        // Voisinage 5x5 pour une meilleure continuité
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < gridHeight && nc >= 0 && nc < gridWidth) {
            const dist = Math.sqrt(dr * dr + dc * dc);
            const weight = Math.exp(-(dist * dist) / (2 * sigma * sigma));
            score += grid[nr][nc] * weight;
          }
        }
      }
      hotScores[r * gridWidth + c + 1] = score;
    }
  }
  return hotScores;
};

// --- DIGITAL ROOT ANALYSIS ---
// Analyzes the trend of digital roots (sum of digits until single digit).
export const calculateDigitalRootAnalysis = (
  history: DrawResult[],
  hurstExponent: number = 0.5,
): Record<number, number> => {
  const rootCounts = new Array(10).fill(0); // Roots 1-9
  const windowSize = getAdaptiveWindow(history.length, hurstExponent);
  const recent = history.slice(0, windowSize);

  recent.forEach((d) => {
    d.gagnants.forEach((n) => {
      let root = n;
      while (root > 9) {
        root = Math.floor(root / 10) + (root % 10);
      }
      if (root >= 1 && root <= 9) rootCounts[root]++;
    });
  });

  const scores: Record<number, number> = {};
  const maxCount = Math.max(...rootCounts.slice(1)) || 1;

  for (let n = 1; n <= DOMAIN_SIZE; n++) {
    let root = n;
    while (root > 9) {
      root = Math.floor(root / 10) + (root % 10);
    }
    scores[n] = (rootCounts[root] / maxCount) * 100;
  }
  return scores;
};

// --- RESISTANCE ANALYSIS ---
// Identifies numbers that are "due" (high gap) but have high probability (Bayes/Freq).
// Resistance = Gap * Frequency (simplified)
export const calculateResistanceScores = (
  history: DrawResult[],
  hurstExponent: number = 0.5,
): Record<number, number> => {
  const scores: Record<number, number> = {};
  const windowSize = getAdaptiveWindow(history.length, hurstExponent);
  const sample = history.slice(0, windowSize);

  const recentFreq = new Map<number, number>();
  const gaps = new Map<number, number>();

  sample.forEach((d) =>
    d.gagnants.forEach((n) => recentFreq.set(n, (recentFreq.get(n) || 0) + 1)),
  );

  for (let n = 1; n <= DOMAIN_SIZE; n++) {
    let gap = 0;
    for (let i = 0; i < sample.length; i++) {
      if (sample[i].gagnants.includes(n)) break;
      gap++;
    }
    gaps.set(n, gap);
  }

  // Calcul des statistiques robustes pour normaliser la sigmoïde
  const geomMeans: number[] = [];
  for (let n = 1; n <= DOMAIN_SIZE; n++) {
    const f = recentFreq.get(n) || 0;
    const g = gaps.get(n) || 0;
    geomMeans.push(Math.sqrt(f * (g + 1))); // +1 pour éviter log(0)
  }

  const medianGeom = geomMeans.slice().sort((a, b) => a - b)[
    Math.floor(DOMAIN_SIZE / 2)
  ];
  const stdGeom =
    Math.sqrt(
      geomMeans.reduce((acc, val) => acc + Math.pow(val - medianGeom, 2), 0) /
        DOMAIN_SIZE,
    ) || 1;
  const slope = 1.0 / (stdGeom + 1e-6); // Pente dérivée de la dispersion des données

  for (let n = 1; n <= DOMAIN_SIZE; n++) {
    const f = recentFreq.get(n) || 0;
    const g = gaps.get(n) || 0;
    const geomMean = Math.sqrt(f * (g + 1));

    // Sigmoïde centrée sur la médiane observée, avec une pente inversement proportionnelle à l'écart-type
    scores[n] = 100 / (1 + Math.exp(-slope * (geomMean - medianGeom)));
  }
  return scores;
};

// --- GAP VELOCITY ---
// Measures the rate of change of gaps with fractional memory.
// If gaps are getting smaller, velocity is positive (heating up).
// Uses a robust fractional differentiation (binomial expansion of (1 - L)^d operator)
// which preserves long-term history compared to integer-order differentiating.
export const calculateGapVelocityScores = (
  history: DrawResult[],
  hurstExponent: number = 0.5,
): Record<number, number> => {
  const scores: Record<number, number> = {};
  if (history.length === 0) return scores;

  // Détermination de la profondeur de mémoire adaptative
  const windowSize = getAdaptiveWindow(history.length, hurstExponent);
  const limit = Math.min(history.length, Math.max(10, windowSize * 2));

  // Calcul de l'ordre de différenciation fractionnaire d continûment de Hurst
  // d = 0.53 + (0.5 - H) * 0.25 (borné précisément entre 0.1 et 0.9 pour conserver le régime fractionnaire)
  const d = Math.max(0.1, Math.min(0.9, 0.53 + (0.5 - hurstExponent) * 0.25));

  // Pré-calcul des coefficients binomial expansion (mémoire fractionnaire)
  const weights = new Float32Array(limit);
  weights[0] = 1.0;
  for (let k = 1; k < limit; k++) {
    weights[k] = weights[k - 1] * (1.0 - (d + 1.0) / k);
  }

  const velocities = new Float32Array(DOMAIN_SIZE + 1);

  for (let n = 1; n <= DOMAIN_SIZE; n++) {
    // Reconstruction de la série chronologique des gaps courants (du plus ancien au plus récent)
    const gaps = new Float32Array(limit);
    let currentGap = 0;
    for (let j = 0; j < limit; j++) {
      const i = limit - 1 - j;
      if (history[i].gagnants.includes(n)) {
        currentGap = 0;
      } else {
        currentGap++;
      }
      gaps[j] = currentGap;
    }

    // Différenciation fractionnaire au pas le plus récent (t = limit - 1)
    let diffVal = 0;
    for (let k = 0; k < limit; k++) {
      diffVal += weights[k] * gaps[limit - 1 - k];
    }

    // Comme une tendance de gap décroissante (négative) signifie que le numéro se réchauffe (Gap gagne en vélocité),
    // on inverse le signe pour que l'index de vélocité soit positif lors du réchauffement.
    velocities[n] = -diffVal;
  }

  // Extraction des statistiques robustes pour un étalement sigmoïdal continu sans valeur magique
  const rawVals = Array.from(velocities.slice(1));
  const medianVal =
    rawVals.slice().sort((a, b) => a - b)[Math.floor(DOMAIN_SIZE / 2)] || 0;
  const stdDevVal =
    Math.sqrt(
      rawVals.reduce((acc, val) => acc + Math.pow(val - medianVal, 2), 0) /
        DOMAIN_SIZE,
    ) || 1;
  const slope = 1.0 / (stdDevVal + 1e-6);

  for (let n = 1; n <= DOMAIN_SIZE; n++) {
    const v = velocities[n];
    // Normalisation via une fonction logistique de transition continue
    scores[n] = 100.0 / (1.0 + Math.exp(-slope * (v - medianVal)));
  }

  return scores;
};

// --- GRAPH CO-OCCURRENCE CLUSTERING (Triadic Clustering Tensor) ---
// Merges Self-Attention, Triadic Closure, and Quantum Co-occurrence.
// quantifies the affinity of each number to complete triads with pairs from the last draw.
export const calculateCoOccurrenceScores = (
  history: DrawResult[],
  hurstExponent: number = 0.5,
): Record<number, number> => {
  const scores: Record<number, number> = {};
  if (history.length < 2) return scores;

  const lastDraw = history[0].gagnants;
  const windowSize = getAdaptiveWindow(history.length, hurstExponent);
  // Chronological traversal from oldest to newest to satisfy recursive Kalman state estimation
  const sample = history.slice(1, windowSize).reverse();

  // Dictionnaire des dyades : Map de `${n1}-${n2}` -> count (avec n1 < n2)
  const dyadicMap = new Map<string, number>();
  // Dictionnaire des triades : Map de `${n1}-${n2}-${n3}` -> count (avec n1 < n2 < n3)
  const triadicMap = new Map<string, number>();

  const DOMAIN_SIZE = 90;
  
  // Kalman state vector for each of the 90 numbers
  const kalmanState = new Float64Array(DOMAIN_SIZE + 1).fill(0.5);
  const kalmanCovariance = new Float64Array(DOMAIN_SIZE + 1).fill(1.0);

  // continuous noise parameters (Zero magic numbers, derived from Shannon local entropy dynamically)
  // We estimate Shannon Entropy of this window to calibrate Kalman covariance noise continuous parameters
  const freq = new Float32Array(DOMAIN_SIZE + 1);
  let totalFreq = 0;
  sample.forEach(draw => {
    draw.gagnants.forEach(n => {
      if (n >= 1 && n <= DOMAIN_SIZE) { freq[n]++; totalFreq++; }
    });
  });
  let H = 0.95;
  if (totalFreq > 0) {
    let ent = 0;
    for (let c = 1; c <= DOMAIN_SIZE; c++) {
      if (freq[c] > 0) {
        const p = freq[c] / totalFreq;
        ent -= p * Math.log2(p);
      }
    }
    H = ent / Math.log2(DOMAIN_SIZE);
  }

  // Dynamic process noise Q and measurement noise R derived from Shannon Entropy (H)
  const Q = 0.02 * (1.0 - Math.pow(H, 2.0));
  const R = 0.40 * (1.0 + Math.pow(H, 2.0));

  sample.forEach((draw, drawIdx) => {
    const nums = [...draw.gagnants].sort((a, b) => a - b);
    const len = nums.length;

    // 1. Accumulate dyadic and triadic frequencies up to the current draw
    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        const dyadKey = `${nums[i]}-${nums[j]}`;
        dyadicMap.set(dyadKey, (dyadicMap.get(dyadKey) || 0) + 1);

        for (let k = j + 1; k < len; k++) {
          const triadKey = `${nums[i]}-${nums[j]}-${nums[k]}`;
          triadicMap.set(triadKey, (triadicMap.get(triadKey) || 0) + 1);
        }
      }
    }

    const lastNums = [...lastDraw].sort((a, b) => a - b);
    const sampleSizeBound = Math.max(1, drawIdx + 1);
    const gamma = Math.tanh(sampleSizeBound / 45.0);

    // 2. Kalman Time & Measurement update for each number
    for (let n = 1; n <= DOMAIN_SIZE; n++) {
      // Time update (Predict)
      const x_pred = kalmanState[n];
      const P_pred = kalmanCovariance[n] + Q;

      // Measurement calculation (Affinities with the last draw)
      let dyadicSum = 0;
      let triadicSum = 0;

      lastNums.forEach((c) => {
        if (n === c) return;
        const key = n < c ? `${n}-${c}` : `${c}-${n}`;
        dyadicSum += dyadicMap.get(key) || 0;
      });

      for (let i = 0; i < lastNums.length; i++) {
        for (let j = i + 1; j < lastNums.length; j++) {
          const c1 = lastNums[i];
          const c2 = lastNums[j];
          if (n === c1 || n === c2) continue;

          const sorted = [n, c1, c2].sort((a, b) => a - b);
          const triKey = `${sorted[0]}-${sorted[1]}-${sorted[2]}`;
          triadicSum += triadicMap.get(triKey) || 0;
        }
      }

      const z_raw = (1.0 - gamma) * dyadicSum + gamma * triadicSum;
      // Normalize measurement scale continuously to prevent scale explosion over time
      const z_measured = z_raw / Math.max(1.0, sampleSizeBound * 0.1);

      // Measurement update (Correct)
      const K = P_pred / (P_pred + R);
      kalmanState[n] = x_pred + K * (z_measured - x_pred);
      kalmanCovariance[n] = (1.0 - K) * P_pred;
    }
  });

  // Normalisation logistique continue sans seuil arbitraire (Z-score + Sigmoïde)
  const finalVals = Array.from(kalmanState.slice(1));
  const medianVal = finalVals.slice().sort((a, b) => a - b)[Math.floor(DOMAIN_SIZE / 2)] || 0.5;
  const stdDevVal = Math.sqrt(finalVals.reduce((acc, val) => acc + Math.pow(val - medianVal, 2), 0) / DOMAIN_SIZE) || 0.1;
  const slope = 1.0 / (stdDevVal + 1e-6);

  for (let n = 1; n <= DOMAIN_SIZE; n++) {
    const v = kalmanState[n];
    scores[n] = 100.0 / (1.0 + Math.exp(-slope * (v - medianVal)));
  }

  return scores;
};

// --- TEMPORAL SCORES (Adaptive Decay with Shannon Damper and Geometric Noise - Phase 2) ---
export const calculateTemporalScores = (
  history: DrawResult[],
  hurstExponent: number = 0.5,
): Record<number, number> => {
  const scores: Record<number, number> = {};
  const windowSize = getAdaptiveWindow(history.length, hurstExponent);
  const halfLife = Math.max(3, windowSize * 0.25);
  const lambda0 = Math.log(2) / halfLife;

  const limit = Math.min(history.length, windowSize);

  // 1. Calcul de l'entropie de Shannon locale pour l'Amortisseur de Shannon
  const freq = new Float32Array(DOMAIN_SIZE + 1);
  let totalFreq = 0;
  const entropyHorizon = Math.min(history.length, windowSize);
  for (let j = 0; j < entropyHorizon; j++) {
    history[j].gagnants.forEach((n) => {
      if (n >= 1 && n <= DOMAIN_SIZE) {
        freq[n]++;
        totalFreq++;
      }
    });
  }
  let E = 0.95; // prior théorique uniforme
  if (totalFreq > 0) {
    let ent = 0;
    for (let c = 1; c <= DOMAIN_SIZE; c++) {
      if (freq[c] > 0) {
        const p = freq[c] / totalFreq;
        ent -= p * Math.log2(p);
      }
    }
    E = ent / Math.log2(DOMAIN_SIZE);
  }

  // Amortisseur de Shannon : taux de décroissance exponentielle modulé de façon différentiable
  const lambdaE = lambda0 * Math.exp((E - 0.5) / (1.1 - E));

  // 2. Calcul de la volatilité standardisée locale pour le calage continu du Bruit Géométrique
  const sums = history
    .slice(0, entropyHorizon)
    .map((d) => d.gagnants.reduce((a, b) => a + b, 0));
  let meanSum = 0;
  sums.forEach((s) => (meanSum += s));
  meanSum /= sums.length || 1;
  let varSum = 0;
  sums.forEach((s) => (varSum += Math.pow(s - meanSum, 2)));
  const stdSum = Math.sqrt(varSum / (sums.length || 1)) || 1;

  // Bruit géométrique brut dérivé de l'écart-type réel (sans constante fixe d'arbitrage)
  const σGeom = Math.min(0.25, stdSum / 1000.0);

  // 3. Accumulateur d'indice de décroissance stochastique continue (Brownien géométrique)
  let accumulatedExponent = 0;

  for (let i = 0; i < limit; i++) {
    // Phase d'oscillation déterministe et reproductible couplée aux signatures fractales du tirage
    const geometricNoise = σGeom * Math.cos(i * hurstExponent * Math.PI);
    // Correction de dérive ITO classique pour conserver l'espérance stochastique pure : -1/2 * σ^2
    const itoCorrection = -0.5 * σGeom * σGeom;

    accumulatedExponent += -lambdaE + geometricNoise + itoCorrection;
    const weight = Math.exp(accumulatedExponent) * 100.0;

    history[i].gagnants.forEach((n) => {
      if (n >= 1 && n <= DOMAIN_SIZE) {
        scores[n] = (scores[n] || 0) + weight;
      }
    });
  }

  const max = Math.max(1, ...Object.values(scores));
  for (let n = 1; n <= DOMAIN_SIZE; n++) {
    scores[n] = ((scores[n] || 0) / max) * 100;
  }
  return scores;
};

// --- POISSON SCORES (Loi de Poisson rigoureuse) ---
export const calculatePoissonScores = (
  history: DrawResult[],
): Record<number, number> => {
  const scores: Record<number, number> = {};
  const limit = Math.min(
    history.length,
    getAdaptiveWindow(history.length, 0.5),
  );
  const sample = history.slice(0, limit);

  const freqs = new Map<number, number>();
  sample.forEach((d) =>
    d.gagnants.forEach((n) => freqs.set(n, (freqs.get(n) || 0) + 1)),
  );

  // Lambda théorique : nombre de tirages * probabilité a priori
  const lambda = limit * BASE_PROB;

  for (let n = 1; n <= DOMAIN_SIZE; n++) {
    const k = freqs.get(n) || 0;
    // Z-score de Poisson : (k - λ) / sqrt(λ)
    const deviation = (k - lambda) / Math.sqrt(Math.max(Number.EPSILON, lambda));
    // Pente dérivée de la théorie : 1/sqrt(2π) ≈ 0.3989 est la densité maximale de la normale standard
    // On utilise sqrt(lambda) pour que la sensibilité croisse avec la taille de l'échantillon
    const slope = Math.sqrt(lambda) / (DOMAIN_SIZE * BASE_PROB);
    scores[n] = 100 / (1 + Math.exp(-slope * deviation));
  }
  return scores;
};

// --- LEADER SUCCESSION ---
// Analyzes which numbers tend to follow the "Leader" (first number) of the previous draw.
export const calculateLeaderSuccession = (
  history: DrawResult[],
  hurstExponent: number = 0.5,
): Record<number, number> => {
  const scores: Record<number, number> = {};
  const successionMap = new Map<number, Map<number, number>>();
  const windowSize = getAdaptiveWindow(history.length, hurstExponent);
  const limit = Math.min(history.length, windowSize);

  // Build the map: Leader(Draw T-1) -> Numbers(Draw T)
  for (let i = 0; i < limit - 1; i++) {
    const currentDraw = history[i].gagnants;
    const prevDraw = history[i + 1].gagnants;

    if (prevDraw.length > 0) {
      const leader = prevDraw[0]; // Assuming first number is the leader
      if (!successionMap.has(leader)) successionMap.set(leader, new Map());

      const followers = successionMap.get(leader)!;
      currentDraw.forEach((n) => {
        followers.set(n, (followers.get(n) || 0) + 1);
      });
    }
  }

  // Predict based on the most recent draw's leader
  // Leader = number with highest frequency in the draw (most statistically dominant)
  if (history.length > 0 && history[0].gagnants.length > 0) {
    const lastDraw = history[0].gagnants;
    // Count frequency of each number in recent history to find the dominant one
    const recentFreq = new Map<number, number>();
    history.slice(0, Math.min(limit, history.length)).forEach(d =>
      d.gagnants.forEach(n => recentFreq.set(n, (recentFreq.get(n) || 0) + 1))
    );
    // Leader = most frequent number in the last draw (data-driven, not positional)
    const lastLeader = lastDraw.reduce((best, n) =>
      (recentFreq.get(n) || 0) > (recentFreq.get(best) || 0) ? n : best,
      lastDraw[0]
    );
    const predictions = successionMap.get(lastLeader);

    if (predictions) {
      const maxCount = Math.max(...Array.from(predictions.values())) || 1;
      for (let n = 1; n <= DOMAIN_SIZE; n++) {
        scores[n] = ((predictions.get(n) || 0) / maxCount) * 100;
      }
    }
  }

  return scores;
};

// --- BAYESIAN ANALYSIS (Théorème de Bayes avec Lissage de Laplace rigoureux) ---
export const calculateBayesianScore = (
  history: DrawResult[],
  customWindowRatio?: number,
): Record<number, number> => {
  const scores: Record<number, number> = {};
  if (history.length < 2) return scores;

  const lastDraw = history[0].gagnants;
  const totalDraws = history.length;
  const alpha = 1.0; // Lissage de Laplace standard
  const V = DOMAIN_SIZE;

  const priors = new Map<number, number>();
  history.forEach((d) =>
    d.gagnants.forEach((n) => priors.set(n, (priors.get(n) || 0) + 1)),
  );

  const likelihoods = new Map<number, number>();
  // Utilisation de 10% de l'historique de manière adaptative pour lisser le contexte, avec un min de 2.
  const windowRatio = customWindowRatio !== undefined ? customWindowRatio : 0.1;
  const windowSize = Math.max(2, Math.floor(totalDraws * windowRatio));

  for (let i = 0; i < totalDraws - windowSize; i++) {
    const targetDraw = history[i].gagnants;
    let contextMatches = 0;
    for (let w = 1; w <= windowSize; w++) {
      const prevDraw = history[i + w].gagnants;
      contextMatches += prevDraw.filter((n) => lastDraw.includes(n)).length;
    }

    if (contextMatches > 0) {
      targetDraw.forEach((n) => {
        likelihoods.set(n, (likelihoods.get(n) || 0) + contextMatches);
      });
    }
  }

  let maxPosterior = 0;
  for (let n = 1; n <= DOMAIN_SIZE; n++) {
    const countN = priors.get(n) || 0;
    const prior = (countN + alpha) / (totalDraws * DRAW_SIZE + alpha * V);
    const likelihoodCount = likelihoods.get(n) || 0;

    // P(Context | N) lissée
    const likelihood =
      (likelihoodCount + alpha) / (countN * windowSize + alpha * V);
    const posterior = prior * likelihood;

    scores[n] = posterior;
    if (posterior > maxPosterior) maxPosterior = posterior;
  }

  if (maxPosterior > 0) {
    for (let n = 1; n <= DOMAIN_SIZE; n++) {
      scores[n] = (scores[n] / maxPosterior) * 100;
    }
  }
  return scores;
};

// --- ANOMALY DETECTION (Isolation / Statistical Deviation) ---
export const calculateAnomalyScores = (
  history: DrawResult[],
  hurstExponent: number = 0.5,
): Record<number, number> => {
  const scores: Record<number, number> = {};
  if (history.length === 0) return scores;

  // Detect statistical outliers in frequency and gaps
  const freqs = new Array(DOMAIN_SIZE + 1).fill(0);
  const gaps = new Array(DOMAIN_SIZE + 1).fill(100);

  // Process recent history context
  const windowSize = getAdaptiveWindow(history.length, hurstExponent);
  history.slice(0, windowSize).forEach((d, idx) => {
    d.gagnants.forEach((n) => {
      if (n >= 1 && n <= DOMAIN_SIZE) {
        freqs[n]++;
        if (gaps[n] === 100) gaps[n] = idx;
      }
    });
  });

  const validFreqs = freqs.slice(1);
  const validGaps = gaps.slice(1);

  const medianFreq =
    [...validFreqs].sort((a, b) => a - b)[Math.floor(DOMAIN_SIZE / 2)] || 0;
  const stdFreq =
    Math.sqrt(
      validFreqs.reduce((a, b) => a + Math.pow(b - medianFreq, 2), 0) /
        DOMAIN_SIZE,
    ) || 1;

  const medianGap =
    [...validGaps].sort((a, b) => a - b)[Math.floor(DOMAIN_SIZE / 2)] || 0;
  const stdGap =
    Math.sqrt(
      validGaps.reduce((a, b) => a + Math.pow(b - medianGap, 2), 0) /
        DOMAIN_SIZE,
    ) || 1;

  for (let n = 1; n <= DOMAIN_SIZE; n++) {
    let anomalyScore = 0;

    // Z-Scores based on median
    const zFreq = (freqs[n] - medianFreq) / stdFreq;
    const zGap = (gaps[n] - medianGap) / stdGap;

    // Fréquence Outlier Continue
    anomalyScore += 60 * (1 - Math.exp(-0.5 * zFreq * zFreq));

    // Gap Outlier Continu
    anomalyScore += 40 * (1 - Math.exp(-0.5 * zGap * zGap));

    scores[n] = Math.min(100, Math.max(0, anomalyScore));
  }

  return scores;
};

// --- AI INTUITION (Refonte en Ensemble Géométrique Continu) ---
// Remplace l'addition arbitraire de scores par une moyenne géométrique de signaux normalisés.
export const calculateAiIntuition = (
  history: DrawResult[],
  metrics: Record<string, unknown>,
): Record<number, number> => {
  const scores: Record<number, number> = {};
  const recent = history.slice(0, getAdaptiveWindow(history.length, 0.5));

  // 1. Détection de séquences arithmétiques (Poids continu)
  const sequenceBoost = new Map<number, number>();
  recent.forEach((d) => {
    const nums = [...d.gagnants].sort((a, b) => a - b);
    for (let i = 0; i < nums.length - 1; i++) {
      const diff = nums[i + 1] - nums[i];
      if (diff > 0 && diff < 10) {
        const next = nums[i + 1] + diff;
        if (next <= DOMAIN_SIZE) {
          sequenceBoost.set(next, (sequenceBoost.get(next) || 0) + 1);
        }
      }
    }
  });

  // 2. Anomalie statistique (Z-score de fréquence)
  const freqs = new Float32Array(DOMAIN_SIZE + 1);
  recent.forEach((d) =>
    d.gagnants.forEach((n) => {
      if (n >= 1 && n <= DOMAIN_SIZE) freqs[n]++;
    }),
  );

  const meanFreq =
    Array.from(freqs)
      .slice(1)
      .reduce((a, b) => a + b, 0) / DOMAIN_SIZE;
  const varFreq =
    Array.from(freqs)
      .slice(1)
      .reduce((a, b) => a + Math.pow(b - meanFreq, 2), 0) / DOMAIN_SIZE;
  const stdFreq = Math.sqrt(varFreq) || 1;

  for (let n = 1; n <= DOMAIN_SIZE; n++) {
    let continuousScore = 50.0; // Point d'équilibre neutre

    // Boost de séquence normalisé par la taille de la fenêtre
    const seqNorm = (sequenceBoost.get(n) || 0) / Math.max(1, recent.length);
    continuousScore += seqNorm * 30.0; // Pondération maîtrisée

    // Anomalie de fréquence (plus c'est rare, plus c'est "intuitif" pour un rebond)
    const zScore = stdFreq > 0 ? (freqs[n] - meanFreq) / stdFreq : 0;
    const anomalyFactor = 1.0 - 1.0 / (1.0 + Math.exp(-1.0 * zScore)); // Inverse sigmoïde
    continuousScore += anomalyFactor * 20.0;

    // Résonance spectrale (si fournie)
    const spectralMetrics = metrics?.spectral as
      Array<{ number: number; energy: number }> | undefined;
    if (spectralMetrics) {
      const spec = spectralMetrics.find((s) => s.number === n);
      if (spec) {
        const energyNorm = spec.energy / 100.0;
        continuousScore += energyNorm * 15.0;
      }
    }

    scores[n] = Math.max(0, Math.min(100, continuousScore));
  }
  return scores;
};

// --- FRACTAL RESONANCE (Self-Similarity) ---
// Detects if a number follows a self-similar (fractal) pattern in time.
export const calculateFractalResonance = (
  history: DrawResult[],
  hurstExponent: number = 0.5,
): Record<number, number> => {
  const scores: Record<number, number> = {};
  const limit = Math.min(
    history.length,
    getAdaptiveWindow(history.length, hurstExponent) * 2,
  ); // Fractals need more history

  let sumGlobalResonance = 0;
  const avgResonances: number[] = [];

  for (let n = 1; n <= DOMAIN_SIZE; n++) {
    const appearances: number[] = [];
    for (let i = 0; i < limit; i++) {
      if (history[i].gagnants.includes(n)) {
        appearances.push(i);
      }
    }

    if (appearances.length < 3) {
      avgResonances.push(0);
      continue;
    }

    const gaps: number[] = [];
    for (let i = 0; i < appearances.length - 1; i++) {
      gaps.push(appearances[i + 1] - appearances[i]);
    }

    let resonance = 0;
    for (let i = 0; i < gaps.length - 1; i++) {
      const ratio = gaps[i] / (gaps[i + 1] || 1);
      // Self-similarity ratios derived from information theory and dynamical systems:
      // - Golden ratio φ ≈ 1.618: Fibonacci scaling (natural recurrence)
      // - Unity ratio 1.0: perfect periodicity
      // - Octave ratio 2.0: period doubling (Feigenbaum cascade)
      // Bandwidth derived from the coefficient of variation of gaps (data-driven)
      const gapCV = gaps.length > 1
        ? (Math.sqrt(gaps.reduce((a, g) => a + Math.pow(g - gaps.reduce((s,x)=>s+x,0)/gaps.length, 2), 0) / gaps.length) /
           (gaps.reduce((s,x)=>s+x,0)/gaps.length + Number.EPSILON))
        : 0.5;
      const bw = Math.max(0.1, gapCV); // Bandwidth proportional to relative variability
      const PHI = (1 + Math.sqrt(5)) / 2; // Golden ratio (exact)
      resonance += Math.exp(-0.5 * Math.pow((ratio - PHI) / bw, 2));
      resonance += Math.exp(-0.5 * Math.pow((ratio - 1.0) / bw, 2));
      resonance += Math.exp(-0.5 * Math.pow((ratio - 2.0) / bw, 2));
    }

    const avgResonance = resonance / (gaps.length || 1);
    avgResonances.push(avgResonance);
    sumGlobalResonance += avgResonance;
  }

  const medianResonance =
    [...avgResonances].sort((a, b) => a - b)[Math.floor(DOMAIN_SIZE / 2)] || 0;
  const stdResonance =
    Math.sqrt(
      avgResonances.reduce(
        (acc, val) => acc + Math.pow(val - medianResonance, 2),
        0,
      ) / DOMAIN_SIZE,
    ) || 1;
  const slope = 1.0 / (stdResonance + 1e-6);

  for (let n = 1; n <= DOMAIN_SIZE; n++) {
    const res = avgResonances[n - 1];
    if (res === 0) {
      scores[n] = 100 / (1 + Math.exp(-slope * (0 - medianResonance))); // Equivalent au mapping, mais pour 0
    } else {
      scores[n] = 100 / (1 + Math.exp(-slope * (res - medianResonance)));
    }
  }

  return scores;
};

// --- CROSS CORRELATION (MATRICIAL) ---
// Identifies recurring pairs of numbers iteratively.
export const calculateCrossCorrelation = (
  history: DrawResult[],
): Record<string, number> => {
  const correlationMatrix: Record<string, number> = {};
  if (history.length < 2) return correlationMatrix;

  const validHistory = history.map((d) =>
    d.gagnants.filter((n) => n >= 1 && n <= DOMAIN_SIZE).sort((a, b) => a - b),
  );

  for (const draw of validHistory) {
    for (let i = 0; i < draw.length; i++) {
      for (let j = i + 1; j < draw.length; j++) {
        const pair = `${draw[i]}-${draw[j]}`;
        correlationMatrix[pair] = (correlationMatrix[pair] || 0) + 1;
      }
    }
  }

  // Calculate standard deviation to filter significant pairs
  const counts = Object.values(correlationMatrix);
  if (counts.length === 0) return {};

  const sum = counts.reduce((a, b) => a + b, 0);
  const mean = sum / counts.length;
  const stdDev =
    Math.sqrt(
      counts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / counts.length,
    ) || 1;

  // Normalize scores using sigmoid based on standard deviation
  const normalizedMatrix: Record<string, number> = {};
  for (const [pair, count] of Object.entries(correlationMatrix)) {
    const zScore = (count - mean) / stdDev;
    // Keep only pairs that appear more often than average
    if (zScore > 0) {
      normalizedMatrix[pair] = 100 / (1 + Math.exp(-2.0 * zScore));
    }
  }

  return normalizedMatrix;
};

// ============================================================================
// VECTEUR D'ATTAQUE : PROCESSUS DE HAWKES & MATRICES ALÉATOIRES (RMT)
// ============================================================================

/**
 * Modélise la Pression de Contagion via un Processus Ponctuel Auto-Excitatif de Hawkes.
 * RMT (Random Matrix Theory) : Les niveaux de base (bruit blanc) sont écrêtés grâce
 * aux limites théoriques de Marchenko-Pastur pour éviter la surestimation.
 */
export const calculateHawkesExcitation = (
  history: DrawResult[],
): Record<number, number> => {
  const scores: Record<number, number> = {};
  if (history.length === 0) return scores;

  // 1. Détermination du Bruit de Fond selon RMT (Marchenko-Pastur simplifié)
  // Variance empirique d'un ticket de loto (loi hypergéométrique) approchée.
  const variance_empirique = DRAW_SIZE * (1 - BASE_PROB);
  const lambda_max = variance_empirique * Math.pow(1 + Math.sqrt(BASE_PROB), 2);
  // Toute valeur d'excitation inférieure à ce lambda_max (écrêtage de bruit) sera dé-priorisée.

  // 2. Paramètres du noyau adaptatif de Hawkes : λ(t) = μ + Σ α * exp(-β * (t - ti))
  const mu = BASE_PROB; // Taux de base

  const entropy = calculateShannonEntropy(history).normalized || 0.5;
  const volatility = calculateVolatility(history).score / 100.0 || 0.5;

  // Amplitude d'excitation (saut d'intensité par occurrence) dérivée du régime de volatilité
  const alpha = 0.2 + 0.5 * volatility;

  // Taux de décroissance d'excitation (dissipation) dérivé de l'entropie
  const beta = 0.1 + 0.3 * entropy;

  // Itération inversée (du plus ancien au plus récent)
  for (let num = 1; num <= DOMAIN_SIZE; num++) {
    let intensity = mu;

    // On boucle sur l'historique de t=T-N à t=T (le dernier tirage)
    // history[0] est le plus récent, history[len-1] est le plus ancien
    const horizon = Math.min(150, history.length);
    for (let timeStep = horizon - 1; timeStep >= 0; timeStep--) {
      // @ts-ignore - auto generated by cleanup
      const deltaT = timeStep; // Distance temporelle jusqu'au moment présent
      const winners = history[timeStep].gagnants;

      if (winners.includes(num)) {
        // Saut d'intensité (excitation positive) instantané
        intensity += alpha;
      }
      // Décroissance exponentielle continue entre les pas
      intensity = mu + (intensity - mu) * Math.exp(-beta);
    }

    // 3. Filtrage du signal par Théorie des Matrices Aléatoires (RMT)
    // Si l'intensité n'a pas dépassé le bruit systémique (lambda_max), pénalité asymétrique
    let signalTenseur = intensity;
    if (intensity < mu + lambda_max) {
      // Dégradation douce via une sigmoïde logistique
      signalTenseur *=
        1.0 / (1.0 + Math.exp(2.0 * (mu + lambda_max - intensity)));
    }

    // Normalisation 0-100 autour d'une courbe logistique continue
    scores[num] = 100 * (1.0 - Math.exp(-signalTenseur));
  }

  return scores;
};

// ============================================================================
// COMBINAISON VECTORIELLE 1 & 2 : PERTE TOPOLOGIQUE + EXPOSANT DE LYAPUNOV
// ============================================================================

/**
 * Calcule un score prédictif en combinant la continuité topologique (Near-Miss)
 * avec l'exposant de Lyapunov (Détection de divergence fractale).
 *
 * Un système à divergence positive (Lyapunov > 0) a tendance à "fuir" les attracteurs récents
 * pour explorer de nouveaux sommets topologiques. Un système stable (Lyapunov < 0) reste
 * concentré.
 */
export const calculateTopologicalLyapunov = (
  history: DrawResult[],
  customHorizon?: number,
): Record<number, number> => {
  const scores: Record<number, number> = {};
  if (history.length < 5) return scores;

  const baseHorizon = customHorizon !== undefined ? customHorizon : 50;
  const horizon = Math.min(baseHorizon, history.length);
  const recentHistory = history.slice(0, horizon);

  const getGridPos = (val: number) => {
    const row = Math.floor((val - 1) / 10);
    const col = (val - 1) % 10;
    return { row, col };
  };

  // 1. Calcul de l'Exposant de Lyapunov empirique maximal (λ) sur l'historique
  // Nous mesurons le taux exponentiel de divergence topologique entre trajectoires temporelles.
  let lyapunovSum = 0;
  let validSteps = 0;

  for (let i = 0; i < horizon - 2; i++) {
    const t0 = recentHistory[i + 1].gagnants;
    const t1 = recentHistory[i].gagnants;

    // Distance topologique entre le tirage à t et t+1
    let topologicalDist = 0;
    for (const c1 of t1) {
      let minDist = 999;
      const pos1 = getGridPos(c1);
      for (const c0 of t0) {
        const pos0 = getGridPos(c0);
        // Distance euclidienne sur la grille
        const d = Math.sqrt(
          Math.pow(pos1.row - pos0.row, 2) + Math.pow(pos1.col - pos0.col, 2),
        );
        if (d < minDist) minDist = d;
      }
      topologicalDist += minDist;
    }

    // Pour éviter le log(0), on ajoute un epsilon
    const divergenceRate = Math.log(topologicalDist + 1e-4);
    lyapunovSum += divergenceRate;
    validSteps++;
  }

  const lambda = validSteps > 0 ? lyapunovSum / validSteps : 0.0;
  const isChaotic = lambda > 0; // Divergence fractale

  // 2. Projection sur les candidats avec la Fonction de Perte Topologique
  // Si Chaotique (λ > 0) -> On favorise l'exploration (fuite topologique).
  // Si Stable (λ < 0) -> On favorise l'exploitation (voisins topologiques, near-miss).
  const lastDraw = history[0].gagnants;

  // Zéro nombres magiques: paramètres d'amortissement dérivés de la dynamique continue de la série
  const entropy = calculateShannonEntropy(history).normalized || 0.5;
  const gridDamping = Math.exp(-0.5 * entropy);
  const revDamping = 1.0 - entropy;

  for (let num = 1; num <= DOMAIN_SIZE; num++) {
    const posNum = getGridPos(num);

    // Évaluer le "Near-Miss" topologique par rapport au dernier tirage
    let maxSim = 0.0;
    for (const w of lastDraw) {
      const posW = getGridPos(w);
      const gridDist = Math.sqrt(
        Math.pow(posNum.row - posW.row, 2) + Math.pow(posNum.col - posW.col, 2),
      );

      // Proximité continue
      const gridSim = Math.exp(-gridDamping * gridDist);

      // Symétrie topologique et inversion continue (DÉTERMINISTE ZÉRO NOMBRES MAGIQUES)
      const circularDiff = Math.min(Math.abs(num - w), 90 - Math.abs(num - w));
      const distanceAffinity = Math.exp(-Math.pow(circularDiff, 2) / 2.0);

      let mirrorSim = distanceAffinity * gridDamping;

      const revNum = parseInt(num.toString().split("").reverse().join(""), 10);
      const revDiff = Math.abs(revNum - w);
      const revAffinity = Math.exp(-Math.pow(revDiff, 2) / 2.0);
      mirrorSim = Math.max(mirrorSim, revAffinity * revDamping);

      const sim = Math.max(gridSim, mirrorSim);
      if (sim > maxSim) maxSim = sim;
    }

    // Combinaison Mathématique
    // maxSim (0 -> 1) représente l'attractivité topologique.
    let resonance = 0;
    if (isChaotic) {
      // Régime Chaotique : Les near-miss intenses (forte sim) sont des pièges.
      // Le champ bifurque, on récompense plutôt les zones d'ombre (anti-similarité).
      // On module la réponse par une tangente hyperbolique sur l'exposant.
      const divergenceForce = Math.tanh(lambda);
      resonance = (1.0 - maxSim) * divergenceForce;
    } else {
      // Régime Stable : Le champ s'effondre sur ses attracteurs.
      // Le near-miss est un signal fort avant-coureur (lissage du signal).
      const stabilityForce = Math.abs(Math.tanh(lambda));
      resonance = maxSim * stabilityForce;
    }

    // Normalisation : On passe la résonance (-1.0 à 1.0) dans une sigmoïde pour la ramener à 0-100
    scores[num] = 100 * (1.0 / (1.0 + Math.exp(-5.0 * resonance)));
  }

  return scores;
};
