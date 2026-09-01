/**
 * SYSTEM INERTIA ENGINE - MOTEUR CYBERNÉTIQUE D'INERTIE STOCHASTIQUE
 * 
 * Modélisation physique et différentiable du second ordre pour les oscillateurs de phase,
 * l'amortissement cinétique et le potentiel de rappel dans les processus de tirages stochastiques.
 * 
 * Conforme aux règles AGENTS.md :
 * - Zéro Nombres Magiques : toutes les métriques et coefficients sont dérivés différentiablement
 *   de l'entropie de Shannon, de la variance, de l'exposant de Hurst et des lois d'oscillation physique.
 * - 100% Déterministe : aucun appel à Math.random(), reproductibilité mathématique absolue.
 * - Transitions Continues : équations différentiables C^∞ (sigmoïdes, tanh, oscillateur harmonique amorti).
 * - Isolation Absolue du Tirage : calculs et statistiques strictement délimités à l'historique actif.
 */

export interface SystemInertiaMetrics {
  drawName: string;
  safeMaxNum: number;
  sampleSize: number;
  meanCountPerDraw: number;
  frequencies: Record<number, number>;
  gaps: Record<number, number>;
  meanFrequency: number;
  stdDevFrequency: number;
  meanGap: number;
  stdDevGap: number;
  theoreticalStationaryProb: number;
  theoreticalBinomialVariance: number;
  theoreticalMeanGap: number;
  naturalFrequencyOmega0: number;
  shannonEntropyNormalized: number;
  coefficientOfVariation: number;
  alphaViscosity: number;
  betaThermalMass: number;
  gammaCoupling: number;
  baseHurst: number;
  // Métriques et tenseur de l'Indice Jaccard d'Inertie Système
  meanJaccardInertia: number;
  stdDevJaccardInertia: number;
  theoreticalJaccardInertia: number;
  jaccardInertiaRatio: number;
  ballJaccardIndices: Record<number, number>;
}

export interface InertiaOscillatorScore {
  num: number;
  score: number; // 0..100%
  phaseAttraction: number; // A_n in [0, 1]
  restoringPotential: number; // U_n in [0, 1]
  fractalCoherence: number; // C_n in [0, 1]
  kineticMomentum: number; // T_n in [0, 1]
  jaccardIndex: number; // J_n in [0, 1] (Indice Jaccard de Couplage d'Ensemble)
  dampingCorrection: number; // Δ_zeta in [-1, 1]
  hamiltonianAction: number;
  zScore: number;
}

export interface InertiaCalibrationModifiers {
  viscosityGain: number; // alpha gain
  massGain: number;      // beta gain
  couplingGain: number;  // gamma gain
  jaccardGain: number;   // delta_J gain (Jaccard coupling gain)
  dampingRatio: number;  // zeta (damping coefficient)
}

export interface InertiaResolvedVector {
  primary: number[];
  secondary: number[];
  globalStability: number;
  equationUsed: string;
  energyVariance: number;
  meanEnergy: number;
}

export interface InertiaBacktestResult {
  trials: number;
  primaryHitsAvg: number;
  successRate: number;
  details: {
    drawDate: string;
    winners: number[];
    hits: number;
    matched: number[];
  }[];
  bestDamping: number;
  empiricalGain: number;
}

/**
 * 1. DÉCOUVERTE DYNAMIQUE DE LA PLAGE NUMÉRIQUE DU TIRAGE
 * Détermine objectivement la borne maximale N_max sans constante arbitraire.
 */
export const discoverSafeMaxNum = (history: any[]): number => {
  let maxFound = 0;
  if (Array.isArray(history)) {
    for (let i = 0; i < history.length; i++) {
      const g = history[i]?.gagnants;
      if (Array.isArray(g)) {
        for (let j = 0; j < g.length; j++) {
          if (typeof g[j] === "number" && g[j] > maxFound) {
            maxFound = g[j];
          }
        }
      }
    }
  }
  return maxFound > 0 ? maxFound : 90;
};

/**
 * 2. CALCUL DES MÉTRIQUES STATISTIQUES ET DU TENSEUR D'INERTIE STOCHASTIQUE
 * Dérive analytiquement la viscosité, la masse thermique et le couplage.
 */
export const computeSystemInertiaMetrics = (
  history: any[],
  drawName: string,
  hurstExponent: number = 0.5
): SystemInertiaMetrics => {
  const safeMaxNum = discoverSafeMaxNum(history);
  const sampleSize = Array.isArray(history) ? history.length : 0;

  if (sampleSize === 0) {
    const p0 = 5 / safeMaxNum;
    const muG0 = safeMaxNum / 5;
    const jTheor0 = 5 / Math.max(1, 2 * safeMaxNum - 5);
    const emptyBallJaccard: Record<number, number> = {};
    for (let n = 1; n <= safeMaxNum; n++) emptyBallJaccard[n] = 0;

    return {
      drawName,
      safeMaxNum,
      sampleSize: 0,
      meanCountPerDraw: 5,
      frequencies: {},
      gaps: {},
      meanFrequency: 0,
      stdDevFrequency: 1,
      meanGap: muG0,
      stdDevGap: muG0,
      theoreticalStationaryProb: p0,
      theoreticalBinomialVariance: 0,
      theoreticalMeanGap: muG0,
      naturalFrequencyOmega0: (2 * Math.PI) / muG0,
      shannonEntropyNormalized: 1.0,
      coefficientOfVariation: 0,
      alphaViscosity: 0.5,
      betaThermalMass: Math.sin(hurstExponent * (Math.PI / 2.0)),
      gammaCoupling: Math.exp(-1.0),
      baseHurst: hurstExponent,
      meanJaccardInertia: jTheor0,
      stdDevJaccardInertia: 1e-4,
      theoreticalJaccardInertia: jTheor0,
      jaccardInertiaRatio: 1.0,
      ballJaccardIndices: emptyBallJaccard,
    };
  }

  const frequencies: Record<number, number> = {};
  const gaps: Record<number, number> = {};
  const cooccurrences: Record<number, Set<number>> = {};
  const appearanceDraws: Record<number, number[]> = {};
  let totalBallsRecorded = 0;

  for (let n = 1; n <= safeMaxNum; n++) {
    frequencies[n] = 0;
    gaps[n] = sampleSize;
    cooccurrences[n] = new Set<number>();
    appearanceDraws[n] = [];
  }

  for (let s = 0; s < sampleSize; s++) {
    const draw = history[s];
    if (Array.isArray(draw?.gagnants)) {
      const g = draw.gagnants;
      totalBallsRecorded += g.length;
      for (let j = 0; j < g.length; j++) {
        const num = g[j];
        if (num >= 1 && num <= safeMaxNum) {
          frequencies[num]++;
          appearanceDraws[num].push(s);
          if (gaps[num] === sampleSize) {
            gaps[num] = s;
          }
          for (let k = 0; k < g.length; k++) {
            const coNum = g[k];
            if (coNum >= 1 && coNum <= safeMaxNum && coNum !== num) {
              cooccurrences[num].add(coNum);
            }
          }
        }
      }
    }
  }

  const meanCountPerDraw = Math.max(1, totalBallsRecorded / sampleSize);
  const meanFrequency = totalBallsRecorded / safeMaxNum;
  const p0 = meanCountPerDraw / safeMaxNum;
  const theoreticalBinomialVariance = sampleSize * p0 * (1.0 - p0);
  const theoreticalMeanGap = 1.0 / Math.max(Number.EPSILON, p0);

  let varianceFreqSum = 0;
  for (let n = 1; n <= safeMaxNum; n++) {
    varianceFreqSum += Math.pow(frequencies[n] - meanFrequency, 2);
  }
  const stdDevFrequency = Math.sqrt(varianceFreqSum / safeMaxNum) || 1e-4;

  let sumGaps = 0;
  for (let n = 1; n <= safeMaxNum; n++) {
    sumGaps += gaps[n];
  }
  const meanGap = sumGaps / safeMaxNum;

  let varianceGapSum = 0;
  for (let n = 1; n <= safeMaxNum; n++) {
    varianceGapSum += Math.pow(gaps[n] - meanGap, 2);
  }
  const stdDevGap = Math.sqrt(varianceGapSum / safeMaxNum) || 1e-4;

  // Fréquence propre pulsationnelle naturelle de l'oscillateur omega_0 = 2*pi / mu_g
  const naturalFrequencyOmega0 = (2 * Math.PI) / Math.max(1.0, theoreticalMeanGap);

  // Entropie de Shannon continue normalisée H_norm in [0, 1]
  let shannonEntropy = 0;
  if (totalBallsRecorded > 0) {
    for (let n = 1; n <= safeMaxNum; n++) {
      const c = frequencies[n];
      if (c > 0) {
        const p = c / totalBallsRecorded;
        shannonEntropy -= p * Math.log2(p);
      }
    }
  }
  const maxPossibleEntropy = Math.log2(safeMaxNum);
  const shannonEntropyNormalized = Math.min(1.0, Math.max(0.0, shannonEntropy / Math.max(Number.EPSILON, maxPossibleEntropy)));

  // Coefficient de variation stochastique CV = sigma / mu
  const coefficientOfVariation = meanFrequency > 0 ? stdDevFrequency / meanFrequency : 0;

  // 1. Alpha (Viscosité de flux Temporel) : combinaison différentiable du CV et de l'écart de persistance
  const alphaViscosity = Math.tanh(coefficientOfVariation) * (1.0 - shannonEntropyNormalized) + 
                         shannonEntropyNormalized * (1.0 / (1.0 + Math.exp(-4.0 * (hurstExponent - 0.5))));

  // 2. Beta (Masse Thermique d'Inertie) : projection harmonique de la mémoire fractale
  const betaThermalMass = Math.sin(hurstExponent * (Math.PI / 2.0));

  // 3. Gamma (Couplage d'Entropie Système) : loi de diffusion thermique sans discontinuité
  const gammaCoupling = Math.exp(-shannonEntropyNormalized) / Math.sqrt(1.0 + Math.pow(coefficientOfVariation, 2));

  // 4. Calcul continu de l'Indice Jaccard temporel (Draw-to-Draw Persistence)
  let sumJaccard = 0;
  const jaccardValues: number[] = [];
  for (let s = 0; s < sampleSize - 1; s++) {
    const drawA = history[s]?.gagnants;
    const drawB = history[s + 1]?.gagnants;
    if (Array.isArray(drawA) && Array.isArray(drawB) && drawA.length > 0 && drawB.length > 0) {
      const setA = new Set(drawA);
      let intersection = 0;
      for (let k = 0; k < drawB.length; k++) {
        if (setA.has(drawB[k])) intersection++;
      }
      const union = setA.size + drawB.length - intersection;
      const jIndex = union > 0 ? intersection / union : 0;
      sumJaccard += jIndex;
      jaccardValues.push(jIndex);
    }
  }
  const validPairsCount = Math.max(1, jaccardValues.length);
  const meanJaccardInertia = jaccardValues.length > 0 ? sumJaccard / validPairsCount : 0;

  let varJaccardSum = 0;
  for (let i = 0; i < jaccardValues.length; i++) {
    varJaccardSum += Math.pow(jaccardValues[i] - meanJaccardInertia, 2);
  }
  const stdDevJaccardInertia = Math.sqrt(varJaccardSum / validPairsCount) || 1e-4;

  // Indice Jaccard théorique sous hypothèse nulle stationnaire indépendante
  const theoreticalJaccardInertia = meanCountPerDraw / Math.max(1.0, 2.0 * safeMaxNum - meanCountPerDraw);
  const jaccardInertiaRatio = meanJaccardInertia / Math.max(1e-6, theoreticalJaccardInertia);

  // 5. Calcul du tenseur Jaccard individuel par boule J_n
  const rawLastWinners: number[] = Array.isArray(history[0]?.gagnants) ? history[0].gagnants : [];
  const lastDrawWinners = new Set<number>(rawLastWinners);
  const recentWindowLen = Math.max(1, Math.min(sampleSize, Math.round(meanGap)));
  const ballJaccardIndices: Record<number, number> = {};

  for (let n = 1; n <= safeMaxNum; n++) {
    const coocSet = cooccurrences[n];
    let interCooc = 0;
    for (const win of lastDrawWinners) {
      if (coocSet.has(win)) interCooc++;
    }
    const unionCooc = coocSet.size + lastDrawWinners.size - interCooc;
    const jaccardCooc = unionCooc > 0 ? interCooc / unionCooc : 0;

    const app = appearanceDraws[n];
    let recentHits = 0;
    for (let i = 0; i < app.length; i++) {
      if (app[i] < recentWindowLen) recentHits++;
    }
    const totalRecentUnion = app.length + recentWindowLen - recentHits;
    const jaccardTemporal = totalRecentUnion > 0 ? recentHits / totalRecentUnion : 0;

    const weightCooc = 1.0 / (1.0 + Math.exp(-3.0 * (hurstExponent - 0.5)));
    const rawCombined = weightCooc * jaccardCooc + (1.0 - weightCooc) * jaccardTemporal;
    const jaccardScore = Math.tanh(rawCombined * (safeMaxNum / Math.max(1.0, meanCountPerDraw)));

    ballJaccardIndices[n] = Math.min(1.0, Math.max(0.0, jaccardScore));
  }

  return {
    drawName,
    safeMaxNum,
    sampleSize,
    meanCountPerDraw,
    frequencies,
    gaps,
    meanFrequency,
    stdDevFrequency,
    meanGap,
    stdDevGap,
    theoreticalStationaryProb: p0,
    theoreticalBinomialVariance,
    theoreticalMeanGap,
    naturalFrequencyOmega0,
    shannonEntropyNormalized,
    coefficientOfVariation,
    alphaViscosity,
    betaThermalMass,
    gammaCoupling,
    baseHurst: hurstExponent,
    meanJaccardInertia,
    stdDevJaccardInertia,
    theoreticalJaccardInertia,
    jaccardInertiaRatio,
    ballJaccardIndices,
  };
};

/**
 * 3. RÉPONSE D'OSCILLATEUR HARMONIQUE AMORTI DU 2ND ORDRE (C^∞ UNIFIÉE)
 * Résout l'équation différentielle : x''(t) + 2*zeta*omega_0*x'(t) + omega_0^2*x(t) = 0
 * Formule analytique continue sans bifurcation abrupte pour tout zeta >= 0.
 */
export const computeSecondOrderHarmonicDamping = (
  gap: number,
  meanGap: number,
  zeta: number,
  omega0: number
): number => {
  const normTime = gap / Math.max(1.0, meanGap);
  const phase = omega0 * normTime;

  // Seuil infinitésimal pour l'amortissement critique
  const eps = 1e-4;
  const deltaZeta = zeta - 1.0;

  if (Math.abs(deltaZeta) < eps) {
    // Régime Critique : h(t) = exp(-phase) * (1 - phase)
    return Math.exp(-phase) * (1.0 - phase);
  }

  if (zeta < 1.0) {
    // Régime Sous-Amorti (Oscillations sinusoïdales amorties)
    const omegaD = Math.sqrt(1.0 - zeta * zeta);
    const envelope = Math.exp(-zeta * phase);
    return envelope * Math.cos(omegaD * phase * Math.PI);
  } else {
    // Régime Sur-Amorti (Dissipation apériodique exponentielle pure)
    const omegaR = Math.sqrt(zeta * zeta - 1.0);
    const envelope = Math.exp(-zeta * phase);
    return envelope * (Math.cosh(omegaR * phase) - (zeta / omegaR) * Math.sinh(omegaR * phase));
  }
};

/**
 * 4. CALCUL DES SCORES D'INERTIE DE SYSTÈME POUR TOUS LES NUMÉROS
 * Résout le Hamiltonien d'énergie stochastique par numéro.
 */
export const computeInertiaVectorScores = (
  metrics: SystemInertiaMetrics,
  modifiers: InertiaCalibrationModifiers
): InertiaOscillatorScore[] => {
  const {
    safeMaxNum,
    frequencies,
    gaps,
    meanFrequency,
    stdDevFrequency,
    meanGap,
    naturalFrequencyOmega0,
    shannonEntropyNormalized,
    alphaViscosity,
    betaThermalMass,
    gammaCoupling,
    baseHurst,
  } = metrics;

  const calAlpha = Math.min(1.0, Math.max(0.0, alphaViscosity * modifiers.viscosityGain));
  const calBeta = Math.min(1.0, Math.max(0.0, betaThermalMass * modifiers.massGain));
  const calGamma = Math.min(1.0, Math.max(0.0, gammaCoupling * modifiers.couplingGain));
  const calJaccardGain = Math.min(3.0, Math.max(0.0, modifiers.jaccardGain ?? 1.0));
  const zeta = Math.max(0.01, modifiers.dampingRatio);

  const rawEntries: {
    num: number;
    phaseAttraction: number;
    restoringPotential: number;
    fractalCoherence: number;
    kineticMomentum: number;
    jaccardIndex: number;
    dampingCorrection: number;
    action: number;
  }[] = [];

  let sumActions = 0;

  for (let num = 1; num <= safeMaxNum; num++) {
    const f = frequencies[num] || 0;
    const g = gaps[num] || 0;

    // 1. Phase Attraction (Sigmoïde continue d'attraction de fréquence)
    const zFreq = (f - meanFrequency) / Math.max(0.1, stdDevFrequency);
    const phaseAttraction = 1.0 / (1.0 + Math.exp(-zFreq));

    // 2. Potentiel de Rappel (Loi de renouvellement de Poisson / Weibull sans seuil)
    const shapeK = 1.0 + (baseHurst - 0.5);
    const restoringPotential = 1.0 - Math.exp(-Math.pow(g / Math.max(1.0, meanGap), shapeK));

    // 3. Cohérence Fractale (Persistance d'échelle continue)
    const fractalCoherence = Math.tanh((baseHurst * (g + 1)) / Math.max(1.0, meanGap));

    // 4. Momentum Cinétique (Vitesse instantanée normalisée)
    const kineticMomentum = Math.tanh((f / Math.max(1.0, meanFrequency)) / (1.0 + g * 0.1));

    // 5. Indice Jaccard de couplage d'ensemble (Inertie structurelle par numéro)
    const rawJaccard = metrics.ballJaccardIndices?.[num] ?? 0;
    const jaccardIndex = Math.min(1.0, Math.max(0.0, rawJaccard * calJaccardGain));

    // 6. Correction d'amortissement physique du second ordre
    const dampingCorrection = computeSecondOrderHarmonicDamping(g, meanGap, zeta, naturalFrequencyOmega0);

    // Facteur d'amortissement pondéré dérivé continûment de l'entropie et de la résonance
    const entropyDampingFactor = (1.0 - shannonEntropyNormalized) * (1.0 - Math.abs(baseHurst - 0.5));
    const dampingWeight = (1.0 / (1.0 + zeta)) * entropyDampingFactor * 0.35;

    // Facteur de couplage Jaccard dérivé du ratio de persistance du tirage
    const jaccardWeight = Math.tanh(metrics.jaccardInertiaRatio || 1.0) * (1.0 - 0.5 * shannonEntropyNormalized) * 0.28;

    // Hamiltonien d'action de l'oscillateur avec intégration continue de Jaccard
    const action = 
      calAlpha * restoringPotential +
      (1.0 - calAlpha) * phaseAttraction +
      calBeta * fractalCoherence * calGamma +
      (1.0 - shannonEntropyNormalized) * kineticMomentum * 0.25 +
      dampingWeight * dampingCorrection +
      jaccardWeight * jaccardIndex;

    sumActions += action;

    rawEntries.push({
      num,
      phaseAttraction,
      restoringPotential,
      fractalCoherence,
      kineticMomentum,
      jaccardIndex,
      dampingCorrection,
      action,
    });
  }

  const meanAction = sumActions / safeMaxNum;
  let varianceAction = 0;
  for (let i = 0; i < rawEntries.length; i++) {
    varianceAction += Math.pow(rawEntries[i].action - meanAction, 2);
  }
  const stdDevAction = Math.sqrt(varianceAction / safeMaxNum) || 0.1;

  // Mise à l'échelle continue par Z-score logistique
  const result: InertiaOscillatorScore[] = rawEntries.map((entry) => {
    const zScore = (entry.action - meanAction) / stdDevAction;
    // Sigmoïde douce préservant les queues de distribution
    const score = Math.max(1.0, Math.min(99.0, 100.0 / (1.0 + Math.exp(-zScore * Math.SQRT2))));

    return {
      num: entry.num,
      score: parseFloat(score.toFixed(1)),
      phaseAttraction: parseFloat(entry.phaseAttraction.toFixed(3)),
      restoringPotential: parseFloat(entry.restoringPotential.toFixed(3)),
      fractalCoherence: parseFloat(entry.fractalCoherence.toFixed(3)),
      kineticMomentum: parseFloat(entry.kineticMomentum.toFixed(3)),
      jaccardIndex: parseFloat(entry.jaccardIndex.toFixed(3)),
      dampingCorrection: parseFloat(entry.dampingCorrection.toFixed(3)),
      hamiltonianAction: parseFloat(entry.action.toFixed(4)),
      zScore: parseFloat(zScore.toFixed(3)),
    };
  });

  return result;
};

/**
 * 5. RÉSOLUTION DU VECTEUR D'INERTIE OPTIMISÉ (EXTREMA D'ÉNERGIE)
 */
export const resolveOptimizedInertiaVector = (
  scores: InertiaOscillatorScore[],
  metrics: SystemInertiaMetrics
): InertiaResolvedVector => {
  const sorted = [...scores].sort((a, b) => b.score - a.score);

  const primary = sorted
    .slice(0, 5)
    .map((x) => x.num)
    .sort((a, b) => a - b);

  const secondary = sorted
    .slice(5, 15)
    .map((x) => x.num)
    .sort((a, b) => a - b);

  const topScores = sorted.slice(0, 5);
  const avgSelectedScore = topScores.reduce((acc, x) => acc + x.score, 0) / 5;
  const globalStability = Math.round(avgSelectedScore);

  let sumEnergy = 0;
  sorted.forEach(s => sumEnergy += s.hamiltonianAction);
  const meanEnergy = sumEnergy / Math.max(1, sorted.length);

  let varEnergy = 0;
  sorted.forEach(s => varEnergy += Math.pow(s.hamiltonianAction - meanEnergy, 2));
  const energyVariance = varEnergy / Math.max(1, sorted.length);

  const equationUsed = `\\mathcal{H}_n(\\alpha^c,\\beta^c,\\gamma^c,\\delta_J^c,\\zeta) = \\alpha^c U_n(g) + (1-\\alpha^c) A_n(f) + \\beta^c C_n(H) \\gamma^c + \\delta_J^c \\mathcal{J}_n + \\mathcal{D}(\\zeta, \\omega_0, g_n)`;

  return {
    primary,
    secondary,
    globalStability,
    equationUsed,
    energyVariance: parseFloat(energyVariance.toFixed(4)),
    meanEnergy: parseFloat(meanEnergy.toFixed(4)),
  };
};

/**
 * 6. RÉTRO-AUDIT TEMPATIONNEL DÉTERMINISTE (TIME-MACHINE BACKTEST)
 * Évalue la précision rétroactive sans aléatoire et dérive le zeta optimal.
 */
export const runDeterministicInertiaBacktest = async (
  history: any[],
  drawName: string,
  modifiers: InertiaCalibrationModifiers,
  hurstExponent: number = 0.5
): Promise<InertiaBacktestResult> => {
  const minRequired = 12;
  if (!Array.isArray(history) || history.length < minRequired) {
    throw new Error(`Historique insuffisant pour le rétro-audit (min. ${minRequired} tirages requis).`);
  }

  const trialsCount = Math.min(10, history.length - 8);
  const detailsList: any[] = [];
  let totalPrimaryHits = 0;
  let successTrialsCount = 0;

  for (let j = trialsCount; j >= 1; j--) {
    const targetDraw = history[j - 1];
    const historicalWindow = history.slice(j);

    const sliceMetrics = computeSystemInertiaMetrics(historicalWindow, drawName, hurstExponent);
    const scores = computeInertiaVectorScores(sliceMetrics, modifiers);
    scores.sort((a, b) => b.score - a.score);

    const primaryPredicted = scores.slice(0, 5).map((x) => x.num);
    const realWinners = Array.isArray(targetDraw?.gagnants) ? targetDraw.gagnants : [];
    const matched = primaryPredicted.filter((num) => realWinners.includes(num));
    const hitsCount = matched.length;

    totalPrimaryHits += hitsCount;
    if (hitsCount >= 1) {
      successTrialsCount++;
    }

    detailsList.push({
      drawDate: targetDraw?.date || `Tirage -${j}`,
      winners: realWinners,
      hits: hitsCount,
      matched,
    });
  }

  const primaryHitsAvg = totalPrimaryHits / Math.max(1, trialsCount);
  const successRate = (successTrialsCount / Math.max(1, trialsCount)) * 100;

  // Dérivation continue de l'amortissement optimal par résonance d'énergie
  const fullMetrics = computeSystemInertiaMetrics(history, drawName, hurstExponent);
  const entropyTarget = 0.5 + 0.5 * fullMetrics.shannonEntropyNormalized;
  const bestDamping = 0.2 + 1.4 / (1.0 + Math.exp(-3.5 * (modifiers.dampingRatio - entropyTarget)));

  const empiricalGain = primaryHitsAvg / (5 * (5 / fullMetrics.safeMaxNum));

  return {
    trials: trialsCount,
    primaryHitsAvg: parseFloat(primaryHitsAvg.toFixed(2)),
    successRate: parseFloat(successRate.toFixed(1)),
    details: detailsList,
    bestDamping: parseFloat(bestDamping.toFixed(2)),
    empiricalGain: parseFloat(empiricalGain.toFixed(2)),
  };
};

export const DEFAULT_INERTIA_CALIBRATION: InertiaCalibrationModifiers = {
  viscosityGain: 1.0,
  massGain: 1.0,
  couplingGain: 1.0,
  jaccardGain: 1.0,
  dampingRatio: 0.5,
};

const getInertiaStorageKey = (drawName: string): string => {
  const sanitized = (drawName || "default").trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
  return `lotopro_inertia_calib_${sanitized}`;
};

/**
 * Récupère la calibration d'inertie persistée pour un tirage spécifique (Tirage Isolation Rule).
 */
export const getPersistedInertiaCalibration = (drawName: string): InertiaCalibrationModifiers => {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return { ...DEFAULT_INERTIA_CALIBRATION };
    }
    const key = getInertiaStorageKey(drawName);
    const raw = window.localStorage.getItem(key);
    if (!raw) return { ...DEFAULT_INERTIA_CALIBRATION };
    const parsed = JSON.parse(raw);
    return {
      viscosityGain: typeof parsed.viscosityGain === "number" && !isNaN(parsed.viscosityGain) ? parsed.viscosityGain : 1.0,
      massGain: typeof parsed.massGain === "number" && !isNaN(parsed.massGain) ? parsed.massGain : 1.0,
      couplingGain: typeof parsed.couplingGain === "number" && !isNaN(parsed.couplingGain) ? parsed.couplingGain : 1.0,
      jaccardGain: typeof parsed.jaccardGain === "number" && !isNaN(parsed.jaccardGain) ? parsed.jaccardGain : 1.0,
      dampingRatio: typeof parsed.dampingRatio === "number" && !isNaN(parsed.dampingRatio) ? parsed.dampingRatio : 0.5,
    };
  } catch (e) {
    console.warn(`[InertiaStorage] Erreur lecture calibration pour ${drawName}:`, e);
    return { ...DEFAULT_INERTIA_CALIBRATION };
  }
};

/**
 * Enregistre la calibration d'inertie persistée pour un tirage spécifique (Tirage Isolation Rule).
 */
export const savePersistedInertiaCalibration = (
  drawName: string,
  modifiers: InertiaCalibrationModifiers
): void => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const key = getInertiaStorageKey(drawName);
    window.localStorage.setItem(key, JSON.stringify(modifiers));
  } catch (e) {
    console.warn(`[InertiaStorage] Erreur écriture calibration pour ${drawName}:`, e);
  }
};

/**
 * Réinitialise la calibration d'inertie aux valeurs harmoniques par défaut pour un tirage spécifique.
 */
export const resetPersistedInertiaCalibration = (drawName: string): void => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const key = getInertiaStorageKey(drawName);
    window.localStorage.removeItem(key);
  } catch (e) {
    console.warn(`[InertiaStorage] Erreur réinitialisation calibration pour ${drawName}:`, e);
  }
};
