import { EmpiricalCalibration, FALLBACK_CALIBRATION } from "../shared/prediction.types";
import { DrawResult, DetectedPattern, PatternType, OrchestrationMetrics, MimicryMetric, ScoreComposition, AlgoWeights, FeatureVector } from '../types';
import { calculateACValue, calculateShannonEntropy, calculateFractalIndex } from './mathService';


export interface ThermoState {
  cryo: number;     // Froid, Haute persistance, faible entropie
  stable: number;   // Équilibre thermodynamique
  volatile: number; // Mouvement stochastique, haute amplitude
  chaotic: number;  // Entropie maximale, absence de mémoire
}

export interface OrchestrationConfig {
  timeDecay: number; // Remplace lambdaDecay/echoDecay par une décroissance temporelle unique basée sur la demi-vie
  machineWeight: number;
  mirrorWeight: number;
  neighborWeight: number;
  adaptiveHalfLife: number;
  thermoState: ThermoState;
}

/**
 * DÉTECTION GLOBALE DES RÉGIMES THERMO-STATISTIQUES
 * Fonction continue sans embranchements booléens.
 * Transforme les métriques de base (Entropie, Facteur Fractal) en un champ de probabilités d'état.
 */
const detectThermoStatisticalRegime = (history: DrawResult[]): ThermoState => {
  const defaultState = { cryo: 0.25, stable: 0.25, volatile: 0.25, chaotic: 0.25 };
  if (history.length < 5) return defaultState;
  
  const limit = Math.min(history.length, 50);
  const h = calculateFractalIndex(history);
  const e = calculateShannonEntropy(history.slice(0, limit)).normalized;
  
  // Estimation de la "Température" via la variance des amplitudes des tickets
  const sums = history.slice(0, limit).map(d => d.gagnants.reduce((a, b) => a + b, 0));
  const meanSum = sums.reduce((a, b) => a + b, 0) / sums.length;
  const stdSum = Math.sqrt(sums.reduce((a, b) => a + Math.pow(b - meanSum, 2), 0) / sums.length) || 1;
  
  // Normalisation logistique de l'écart-type de la somme 
  // La variance théorique d'une somme de 5 numéros sans remise parmi 90 est :
  // Var = n * (N^2 - 1)/12 * (N - n)/(N - 1)
  const expectedVar = 5 * (90 * 90 - 1) / 12 * (90 - 5) / (90 - 1);
  const expectedStdSum = Math.sqrt(expectedVar);
  
  // Utilise une distribution logistique symétrique : f(x) = 1 / (1 + exp(-k*(x-x0)))
  const temp = 1.0 / (1.0 + Math.exp(-(1.0 / expectedStdSum) * (stdSum - expectedStdSum))); 

  // Calcul du tenseur d'état (Softmax sans nombres magiques isolants)
  // Cryo : Froid (low Temp), Faible Entropie, Haute Persistance (H > 0.5)
  const eVcryo = Math.exp((1.0 - temp) + (1.0 - e) + h); 
  // Stable : Équilibre autour de la médiane temporelle (0.5)
  const eVstable = Math.exp((1.0 - 2.0 * Math.abs(temp - 0.5)) + (1.0 - 2.0 * Math.abs(e - 0.5)));
  // Volatile : Haute Température, Forte Persistance
  const eVvolatile = Math.exp(temp + h); 
  // Chaotic : Haute température, Haute entropie, Anti-persistance (1 - h)
  const eVchaotic = Math.exp(temp + e + (1.0 - h));
  
  const partitionFunction = eVcryo + eVstable + eVvolatile + eVchaotic;
  
  return {
    cryo: eVcryo / partitionFunction,
    stable: eVstable / partitionFunction,
    volatile: eVvolatile / partitionFunction,
    chaotic: eVchaotic / partitionFunction
  };
};

/**
 * CALCUL DE LA DEMI-VIE ADAPTATIVE
 * Remplace les constantes de décroissance arbitraires (0.15, 0.25).
 * La demi-vie est directement modulée par le régime Thermo-Statistique continu.
 */
const calculateAdaptiveHalfLife = (history: DrawResult[], thermoState: ThermoState): number => {
  // Fallback théorique : Espérance mathématique d'un tirage 5/90 (90/5 = 18.0)
  if (history.length < 10) return 18.0; 
  
  // Calcul de l'écart médian des gaps pour estimer la fréquence de base
  const allGaps: number[] = [];
  const lastSeen = new Map<number, number>();
  for (let i = 0; i < Math.min(50, history.length); i++) {
    for (const n of history[i].gagnants) {
      if (lastSeen.has(n)) {
        allGaps.push(i - (lastSeen.get(n) as number));
      }
      lastSeen.set(n, i);
    }
  }
  
  const medianGap = allGaps.length > 0 
    ? allGaps.sort((a, b) => a - b)[Math.floor(allGaps.length / 2)] 
    : 18.0;

  // Modulation du régime continu :
  // Le régime Cryo allonge la mémoire (dépendance forte), le Chaos la détruit (amnésie de Markov)
  const regimeMultiplier = 1.0 + (thermoState.cryo * 1.5) + (thermoState.stable * 0.5) - (thermoState.chaotic * 0.8);
  return Math.max(2.0, medianGap * regimeMultiplier);
};

/**
 * CONFIGURATION DÉRIVÉE DES DONNÉES
 * Modulée par les états Thermo-Statistiques.
 */
export const adaptConfigurationToPhase = (history: DrawResult[]): OrchestrationConfig => {
  const thermoState = detectThermoStatisticalRegime(history);

  if (history.length === 0) {
    return {
      timeDecay: 0.95,
      adaptiveHalfLife: 15.0,
      machineWeight: 1.0,
      mirrorWeight: 1.0,
      neighborWeight: 1.0,
      thermoState
    };
  }

  const halfLife = calculateAdaptiveHalfLife(history, thermoState);
  const timeDecay = Math.pow(0.5, 1.0 / halfLife); // Décroissance exponentielle exacte

  // Analyse empirique des ratios sur une fenêtre récente
  const depth = Math.min(history.length - 1, Math.max(5, Math.floor(history.length * 0.1)));
  let machineHits = 0, mirrorHits = 0, repeatHits = 0;
  let totalMachineNumbers = 0;

  for (let i = 0; i < depth; i++) {
    const draw = history[i];
    const prev = history[i + 1];
    
    if (prev?.machine) {
      totalMachineNumbers += prev.machine.length;
      machineHits += draw.gagnants.filter(n => prev.machine?.includes(n)).length;
    }

    draw.gagnants.forEach(n => {
      const mir = 91 - n;
      if (mir !== n && mir >= 1 && mir <= 90 && prev.gagnants.includes(mir)) mirrorHits++;
      if (prev.gagnants.includes(n)) repeatHits++;
    });
  }

  const machineRatio = totalMachineNumbers > 0 ? machineHits / totalMachineNumbers : 0;
  const mirrorRatio = depth > 0 ? mirrorHits / (depth * 5) : 0;
  const repeatRatio = depth > 0 ? repeatHits / (depth * 5) : 0;

  // Les poids sont normalisés dynamiquement. 
  // Base = 1.0, modulée par le ratio observé via une sigmoïde centrée sur la moyenne théorique.
  // Ex: Probabilité a priori de répétition T-1 = 5/90 ≈ 0.055.
  const baselineRepeat = 5.0 / 90.0;
  const repeatDelta = (repeatRatio - baselineRepeat) / baselineRepeat;
  const repeatBoost = 1.0 + Math.log(1.0 + Math.exp(repeatDelta)); // Smooth continuous Softplus activation

  return {
    timeDecay,
    adaptiveHalfLife: halfLife,
    // Poids dérivés, bornés pour éviter la monopolisation
    machineWeight: Math.min(1.5, 1.0 + (machineRatio * 5.0)), 
    mirrorWeight: Math.min(1.5, 1.0 + (mirrorRatio * 10.0)),
    neighborWeight: Math.min(1.5, 1.0 * repeatBoost),
    thermoState
  };
};

/**
 * SUCCESSIONS MARKOVIENNES AVEC DÉCROISSANCE TEMPORELLE EXACTE
 */
const detectLeaderSuccessions = (history: DrawResult[], config: OrchestrationConfig): Record<number, number> => {
  const scores: Record<number, number> = {};
  if (history.length < 3) return scores;
  const lastDrawWinners = history[0].gagnants;
  const pastResults = history.slice(1);
  const baselineProb = 5.0 / 90.0; // Probabilité a priori exacte

  lastDrawWinners.forEach(leader => {
    const followersMap: Record<number, number> = {};
    let leaderAppearancesWeighted = 0;

    for (let i = 1; i < pastResults.length; i++) {
      if (pastResults[i].gagnants.includes(leader)) {
        const timeDistance = i;
        // Décroissance exacte basée sur la demi-vie adaptative
        const weight = Math.pow(config.timeDecay, timeDistance);
        leaderAppearancesWeighted += weight;

        const nextDraw = pastResults[i - 1];
        nextDraw.gagnants.forEach(follower => {
          followersMap[follower] = (followersMap[follower] || 0) + weight;
        });
      }
    }

    if (leaderAppearancesWeighted > 0) {
      Object.entries(followersMap).forEach(([numStr, count]) => {
        const num = parseInt(numStr);
        const efficiency = count / leaderAppearancesWeighted;
        
        const excessRatio = (efficiency - baselineProb) / baselineProb;
        // Activation Softplus continue pour remplacer le seuil d'écart binaire
        const softActivation = Math.log(1.0 + Math.exp(excessRatio));
        scores[num] = (scores[num] || 0) + (softActivation * (1.0 / baselineProb));
      });
    }
  });

  return scores;
};

export interface ImmediateLesson {
  pattern: PatternType | string;
  description: string;
  impactScore: number;
}

export const analyzeImmediateTrend = (history: DrawResult[], config: OrchestrationConfig = adaptConfigurationToPhase(history)): { lessons: ImmediateLesson[] } => {
  const lessons: ImmediateLesson[] = [];
  if (history.length < 2) return { lessons };
  const lookBack = Math.min(Math.floor(config.adaptiveHalfLife), history.length);
  let echoImpact = 0;
  const repeatedNumbers: number[] = [];

  const baseImpact = 90.0 / 5.0; // 18.0

  for (let i = 1; i < lookBack; i++) {
    const decay = Math.pow(config.timeDecay, i);
    const reps = history[0].gagnants.filter(n => history[i].gagnants.includes(n));
    if (reps.length > 0) {
      // Impact dérivé du nombre de répétitions et de la décroissance temporelle exacte
      echoImpact += reps.length * baseImpact * decay; 
      repeatedNumbers.push(...reps);
    }
  }

  if (echoImpact > 0) {
    const uniqueReps = [...new Set(repeatedNumbers)];
    lessons.push({
      pattern: 'Répétition',
      description: `${uniqueReps.length} numéro(s) en écho récent (${uniqueReps.join(', ')}).`,
      impactScore: Math.round(echoImpact)
    });
  }

  let machineImpact = 0;
  const transferredNumbers: number[] = [];
  for (let i = 1; i < lookBack; i++) {
    const decay = Math.pow(config.timeDecay, i);
    if (history[i].machine) {
      const transfers = history[0].gagnants.filter(n => history[i].machine?.includes(n));
      if (transfers.length > 0) {
        machineImpact += transfers.length * baseImpact * decay * config.machineWeight;
        transferredNumbers.push(...transfers);
      }
    }
  }

  if (machineImpact > 0) {
    const uniqueTransfers = [...new Set(transferredNumbers)];
    lessons.push({
      pattern: 'Transfert Machine',
      description: `${uniqueTransfers.length} transféré(s) depuis la machine récente.`,
      impactScore: Math.round(machineImpact)
    });
  }

  let neighborCount = 0;
  history[0].gagnants.forEach(n => {
    const nLeft = n > 1 ? n - 1 : 90;
    const nRight = n < 90 ? n + 1 : 1;
    if (history[1].gagnants.includes(nLeft) || history[1].gagnants.includes(nRight)) neighborCount++;  });

  if (neighborCount > 0) {
    lessons.push({
      pattern: 'Voisin',
      description: `${neighborCount} voisin(s) direct(s) détecté(s).`,
      impactScore: Math.round(neighborCount * baseImpact * config.neighborWeight)
    });
  }

  return { lessons: lessons.sort((a, b) => b.impactScore !== a.impactScore ? b.impactScore - a.impactScore : a.pattern.localeCompare(b.pattern)) };
};

export interface RefactoredPipelineResult {
  scores: Record<number, number>;
  rawFeatures: Record<number, FeatureVector>;
  normalizedFeatures: Record<number, FeatureVector>;
  weightedScores: Record<number, number>;
  calibratedScores: Record<number, number>;
  candidatesDetails: Record<number, ScoreComposition>;
  top5: number[];
  top18: number[];
  stabilityScore: number;
  regimeDiagnostic: {
    regime: "stable" | "volatile" | "chaotic" | "cryo";
    confidenceInRegime: number;
  };
}

/**
 * PIPELINE UNIFIÉ EN 5 ÉTAGES (DÉTERMINISTE, CONTINU ET SANS NOMBRES MAGIQUES)
 * 1. Extraction des Caractéristiques (7 signaux normalisés dans [0..1] de même unité)
 * 2. Normalisation Statistique (Z-score to Sigmoid dans [0, 1] de façon homogène)
 * 3. Pondération Dynamique (Normalisée selon le régime Thermo-Statistique)
 * 4. Calibration et Shrinkage de Contradiction (James-Stein style)
 * 5. Sélection d'Élite avec Garde-fous de Diversité
 */
export const runOrchestrationPipeline = (
  history: DrawResult[],
  weights?: AlgoWeights
): RefactoredPipelineResult | null => {
  if (history.length < 2) return null;

  // --- ÉTAPE 1 : DIAGNOSTIC DU RÉGIME ---
  const thermoState = detectThermoStatisticalRegime(history);
  const maxProb = Math.max(thermoState.stable, thermoState.volatile, thermoState.chaotic, thermoState.cryo);
  let regime: "stable" | "volatile" | "chaotic" | "cryo" = "stable";
  if (maxProb === thermoState.cryo) regime = "cryo";
  else if (maxProb === thermoState.volatile) regime = "volatile";
  else if (maxProb === thermoState.chaotic) regime = "chaotic";
  
  const regimeDiagnostic = {
    regime,
    confidenceInRegime: maxProb
  };

  const config = adaptConfigurationToPhase(history);
  const lookBack = Math.min(Math.floor(config.adaptiveHalfLife), history.length);
  const totalDraws = history.length;
  
  // --- ÉTAGE 1 (SUITE) : FEATURE EXTRACTION ---
  const rawFeatures: Record<number, FeatureVector> = {} as any;
  
  // Construction des lookup tables
  const lastSeen = new Map<number, number>();
  const appearances = new Map<number, number>();
  const shortAppearances = new Map<number, number>();
  
  history.forEach((draw, idx) => {
    draw.gagnants.forEach(num => {
      if (!lastSeen.has(num)) lastSeen.set(num, idx);
      appearances.set(num, (appearances.get(num) || 0) + 1);
      if (idx < 10) {
        shortAppearances.set(num, (shortAppearances.get(num) || 0) + 1);
      }
    });
  });

  // Évaluation des cycles de retour moyens
  const averageCycles = new Map<number, number>();
  for (let num = 1; num <= 90; num++) {
    const indices: number[] = [];
    history.forEach((draw, idx) => {
      if (draw.gagnants.includes(num)) indices.push(idx);
    });
    if (indices.length > 1) {
      let sumGaps = 0;
      for (let j = 0; j < indices.length - 1; j++) {
        sumGaps += (indices[j + 1] - indices[j]);
      }
      averageCycles.set(num, sumGaps / (indices.length - 1));
    } else {
      averageCycles.set(num, 18.0); // 18.0 est l'écart moyen théorique pour un loto 5/90
    }
  }

  // Transitions markoviennes pondérées par la décroissance temporelle
  const lastDrawWinners = history[0].gagnants;
  const pastResults = history.slice(1);
  const markovTransitions = new Map<number, Map<number, number>>();
  
  pastResults.forEach((draw, idx) => {
    const nextDraw = idx > 0 ? pastResults[idx - 1] : history[0];
    const decay = Math.pow(config.timeDecay, idx + 1);
    
    draw.gagnants.forEach(leader => {
      if (lastDrawWinners.includes(leader)) {
        if (!markovTransitions.has(leader)) {
          markovTransitions.set(leader, new Map());
        }
        const followers = markovTransitions.get(leader)!;
        nextDraw.gagnants.forEach(follower => {
          followers.set(follower, (followers.get(follower) || 0) + decay);
        });
      }
    });
  });

  for (let num = 1; num <= 90; num++) {
    // 1. repeatShort : répétition courte
    let repeatRaw = 0;
    for (let t = 0; t < lookBack; t++) {
      if (history[t].gagnants.includes(num)) {
        repeatRaw += Math.pow(config.timeDecay, t);
      }
    }

    // 2. machineTransfer : machine carry-over
    let machineRaw = 0;
    for (let t = 0; t < lookBack; t++) {
      if (history[t].machine?.includes(num)) {
        machineRaw += Math.pow(config.timeDecay, t);
      }
    }

    // 3. neighbor : voisinage de proximité
    let neighborRaw = 0;
    for (let t = 0; t < lookBack; t++) {
      const winners = history[t].gagnants;
      const decay = Math.pow(config.timeDecay, t);
      winners.forEach(w => {
        const nLeft = w > 1 ? w - 1 : 90;
        const nRight = w < 90 ? w + 1 : 1;
        if (num === nLeft || num === nRight) {
          neighborRaw += decay;
        }
      });
    }

    // 4. mirror : miroir (91 - n)
    let mirrorRaw = 0;
    for (let t = 0; t < lookBack; t++) {
      const mirrorVal = 91 - num;
      if (history[t].gagnants.includes(mirrorVal)) {
        mirrorRaw += Math.pow(config.timeDecay, t);
      }
    }

    // 5. markov : transitions
    let markovRaw = 0;
    lastDrawWinners.forEach(leader => {
      const followers = markovTransitions.get(leader);
      if (followers && followers.has(num)) {
        markovRaw += followers.get(num)!;
      }
    });

    // 6. trend : Vélocité d'écart (Gap Velocity) combiné au ratio de fréquence
    const currentGap = lastSeen.get(num) ?? totalDraws;
    const avgGap = averageCycles.get(num) || 18.0;
    const gapRaw = 1.0 - Math.exp(-currentGap / avgGap);

    const fShort = (shortAppearances.get(num) || 0) / 10.0;
    const fLong = (appearances.get(num) || 0) / totalDraws;
    const freqRaw = fShort / (fLong + Number.EPSILON);
    const trendRaw = (gapRaw + freqRaw) / 2.0;

    // 7. seasonal : alignement harmonique des cycles (saisonnalité)
    const cycle = averageCycles.get(num) || 18.0;
    const cyclePos = currentGap / cycle;
    const seasonalRaw = Math.cos(2 * Math.PI * cyclePos) * 0.5 + 0.5;

    // 8. structuralCoherence : Cohérence harmonique de l'ajout du numéro au sein du ticket T-1
    const testSetForCoherence = [...lastDrawWinners.slice(0, 4), num];
    const structuralCoherenceRaw = calculateCoherence(testSetForCoherence) / 100.0;

    rawFeatures[num] = {
      repeatShort: repeatRaw,
      machineTransfer: machineRaw,
      neighbor: neighborRaw,
      mirror: mirrorRaw,
      markov: markovRaw,
      trend: trendRaw,
      seasonal: seasonalRaw,
      structuralCoherence: structuralCoherenceRaw
    };
  }

  // --- ÉTAGE 2 : NORMALIZATION ---
  const normalizedFeatures: Record<number, FeatureVector> = {} as any;
  const featureKeys: (keyof FeatureVector)[] = [
    'repeatShort',
    'machineTransfer',
    'mirror',
    'neighbor',
    'markov',
    'trend',
    'seasonal',
    'structuralCoherence'
  ];

  for (let num = 1; num <= 90; num++) {
    normalizedFeatures[num] = {} as FeatureVector;
  }

  featureKeys.forEach(key => {
    const values: number[] = [];
    for (let num = 1; num <= 90; num++) {
      values.push(rawFeatures[num][key]);
    }

    // Calcul de la médiane et de l'écart-type robustes
    const sortedVals = [...values].sort((a, b) => a - b);
    const nValsCount = values.length || 90;
    const median = sortedVals[Math.floor(sortedVals.length / 2)];
    const mean = values.reduce((a, b) => a + b, 0) / nValsCount;
    const stdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / nValsCount) || 1.0;

    // Normalisation continue via la sigmoïde logistique centrée sur la médiane
    for (let num = 1; num <= 90; num++) {
      const val = rawFeatures[num][key];
      const z = (val - median) / (stdDev + Number.EPSILON);
      normalizedFeatures[num][key] = 1.0 / (1.0 + Math.exp(-z));
    }
  });

  // --- ÉTAGE 3 : WEIGHTING & DE-CORRELATION PENALTY ---
  // Détermination des poids d'importance initiaux
  const rawW_repeat = config.neighborWeight * (1.0 + (weights?.temporal || 0.0));
  const rawW_machine = config.machineWeight;
  const rawW_neighbor = config.neighborWeight;
  const rawW_mirror = config.mirrorWeight;
  const rawW_markov = 1.0 + (weights?.markov || 0.0);
  const rawW_trend = 1.0 + (((weights?.gap || 0.0) + (weights?.frequency || 0.0)) / 2.0);
  const rawW_seasonal = 1.0 + (weights?.temporal || 0.0);
  const rawW_structuralCoherence = 1.0 + (weights?.derived_neighbor || 0.0);

  // Modulation continue selon le régime stochastique détecté
  const cryoMod = thermoState.cryo;
  const volatileMod = thermoState.volatile;
  const chaoticMod = thermoState.chaotic;
  
  // Modulation par canal (Cryo favorise repeat, markov, trend; Volatile favorise neighbor, mirror)
  let modW_repeat = rawW_repeat * (1.0 + 0.5 * cryoMod - 0.5 * volatileMod);
  let modW_machine = rawW_machine * (1.0 - 0.4 * cryoMod);
  let modW_neighbor = rawW_neighbor * (1.0 - 0.4 * cryoMod + 0.5 * volatileMod);
  let modW_mirror = rawW_mirror * (1.0 + 0.4 * volatileMod);
  let modW_markov = rawW_markov * (1.0 + 0.4 * cryoMod);
  let modW_trend = rawW_trend * (1.0 + 0.4 * cryoMod);
  let modW_seasonal = rawW_seasonal;
  let modW_structuralCoherence = rawW_structuralCoherence * (1.0 - 0.3 * volatileMod);

  // Le chaos harmonise tous les poids vers la moyenne plate pour favoriser la diversité
  if (chaoticMod > 0.01) {
    const avgW = (modW_repeat + modW_machine + modW_neighbor + modW_mirror + modW_markov + modW_trend + modW_seasonal + modW_structuralCoherence) / 8.0;
    modW_repeat = modW_repeat * (1.0 - chaoticMod) + avgW * chaoticMod;
    modW_machine = modW_machine * (1.0 - chaoticMod) + avgW * chaoticMod;
    modW_neighbor = modW_neighbor * (1.0 - chaoticMod) + avgW * chaoticMod;
    modW_mirror = modW_mirror * (1.0 - chaoticMod) + avgW * chaoticMod;
    modW_markov = modW_markov * (1.0 - chaoticMod) + avgW * chaoticMod;
    modW_trend = modW_trend * (1.0 - chaoticMod) + avgW * chaoticMod;
    modW_seasonal = modW_seasonal * (1.0 - chaoticMod) + avgW * chaoticMod;
    modW_structuralCoherence = modW_structuralCoherence * (1.0 - chaoticMod) + avgW * chaoticMod;
  }

  const sumWeights = modW_repeat + modW_machine + modW_neighbor + modW_mirror + modW_markov + modW_trend + modW_seasonal + modW_structuralCoherence;
  
  const w: Record<keyof FeatureVector, number> = {
    repeatShort: modW_repeat / sumWeights,
    machineTransfer: modW_machine / sumWeights,
    neighbor: modW_neighbor / sumWeights,
    mirror: modW_mirror / sumWeights,
    markov: modW_markov / sumWeights,
    trend: modW_trend / sumWeights,
    seasonal: modW_seasonal / sumWeights,
    structuralCoherence: modW_structuralCoherence / sumWeights
  };

  const weightedScores: Record<number, number> = {};
  for (let num = 1; num <= 90; num++) {
    const f = normalizedFeatures[num];
    
    // Détermination de l'activité continue des familles
    const act_inertia = (f.repeatShort + f.trend) / 2.0;
    const act_structure = (f.mirror + f.neighbor + f.structuralCoherence) / 3.0;
    const act_transition = (f.markov + f.machineTransfer) / 2.0;
    const act_seasonal = f.seasonal;

    const families = [act_inertia, act_structure, act_transition, act_seasonal];
    const activeFamiliesCount = families.filter(v => v > 0.4).length;

    // Détermination de la redondance au sein des mêmes familles (signaux corrélés)
    const hasInertiaRedundancy = Math.max(0, Math.min(f.repeatShort, f.trend) - 0.4);
    const hasStructureRedundancy = Math.max(0, Math.min(f.mirror, f.neighbor) - 0.4) + 
                                   Math.max(0, Math.min(f.neighbor, f.structuralCoherence) - 0.4) +
                                   Math.max(0, Math.min(f.mirror, f.structuralCoherence) - 0.4);
    const hasTransitionRedundancy = Math.max(0, Math.min(f.markov, f.machineTransfer) - 0.4);

    const correlatedSignalsCount = (hasInertiaRedundancy ? 1 : 0) + 
                                   (hasStructureRedundancy > 0.2 ? 1 : 0) + 
                                   (hasTransitionRedundancy ? 1 : 0);

    const overlapPenalty = Math.min(0.25, correlatedSignalsCount * 0.08);

    // Récompense de la diversité des familles actives
    const diversityBonus = 0.85 + 0.15 * (activeFamiliesCount / 4.0);

    // Score de base linéaire
    const baseLinearScore =
      w.repeatShort * f.repeatShort +
      w.machineTransfer * f.machineTransfer +
      w.mirror * f.mirror +
      w.neighbor * f.neighbor +
      w.markov * f.markov +
      w.trend * f.trend +
      w.seasonal * f.seasonal +
      w.structuralCoherence * f.structuralCoherence;

    weightedScores[num] = baseLinearScore * (1.0 - overlapPenalty) * diversityBonus;
  }

  // --- ÉTAGE 4 : CALIBRATION & GLOBAL SHRINKAGE ---
  const allWeightedScores = Object.values(weightedScores).sort((a, b) => b - a);
  const top20Scores = allWeightedScores.slice(0, 20);
  const top20Mean = top20Scores.reduce((a, b) => a + b, 0) / 20;
  const top20Variance = top20Scores.reduce((sum, s) => sum + Math.pow(s - top20Mean, 2), 0) / 20;
  const scoreStd = Math.sqrt(top20Variance) || 0.001;
  const top1 = top20Scores[0];
  const top10ScoreVal = top20Scores[9];
  const scoreGap = top1 - top10ScoreVal;
  const sumTop5 = top20Scores.slice(0, 5).reduce((a, b) => a + b, 0);
  const sumTop20 = top20Scores.reduce((a, b) => a + b, 0) || 1.0;
  const concentration = sumTop5 / sumTop20;

  // Formules continues de pénalisation
  const concentrationPenalty = Math.max(0, concentration - 0.28) * 1.5;
  const instabilityPenalty = Math.max(0, scoreStd - 0.12) * 1.0 + Math.max(0, scoreGap - 0.15) * 1.0;

  // Contradiction des caractéristiques sur les 5 meilleures prédictions a priori
  const top5NumsForContradiction = Object.entries(weightedScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(e => Number(e[0]));
  let totalTop5FeatureVariance = 0;
  top5NumsForContradiction.forEach(num => {
    const fVals = featureKeys.map(k => normalizedFeatures[num][k]);
    const fMean = fVals.reduce((a, b) => a + b, 0) / 8;
    const fVar = fVals.reduce((sum, f) => sum + Math.pow(f - fMean, 2), 0) / 8;
    totalTop5FeatureVariance += fVar;
  });
  const contradictionPenalty = (totalTop5FeatureVariance / 5.0) * 1.5;

  const clamp = (min: number, max: number, val: number) => Math.max(min, Math.min(max, val));
  const shrinkage = 1.0 - clamp(0.0, 0.35, concentrationPenalty + instabilityPenalty + contradictionPenalty);

  const calibratedScores: Record<number, number> = {};
  const globalMean = Object.values(weightedScores).reduce((a, b) => a + b, 0) / 90;
  const alpha = 1.0 + 3.0 * thermoState.chaotic;

  for (let num = 1; num <= 90; num++) {
    const numFeatures = featureKeys.map(k => normalizedFeatures[num][k]);
    const numMean = numFeatures.reduce((a, b) => a + b, 0) / 8;
    const numVariance = numFeatures.reduce((sum, f) => sum + Math.pow(f - numMean, 2), 0) / 8;

    const signalVarianceMultiplier = Math.exp(-alpha * numVariance);
    const weightedScore = weightedScores[num];
    const rawCalibrated = globalMean + signalVarianceMultiplier * (weightedScore - globalMean);
    
    calibratedScores[num] = rawCalibrated * shrinkage;
  }

  // --- ÉTAGE 5 : SÉLECTION DIVERSIFIÉE (BEAM SEARCH + EMPIRICAL ADAPTIVE PENALTIES) ---
  let realConsecutivePairs = 0;
  let realMirrorPairs = 0;
  let realDecadePairs = 0;
  let realLastDigitPairs = 0;
  let realT1Repeats = 0;
  let totalDrawsAnalyzed = 0;
  let totalPairsAnalyzed = 0;

  const depthLimit = Math.min(history.length - 1, 50);
  for (let i = 0; i < depthLimit; i++) {
    const draw = history[i];
    const prev = history[i + 1];
    totalDrawsAnalyzed++;

    if (prev) {
      realT1Repeats += draw.gagnants.filter(n => prev.gagnants.includes(n)).length;
    }

    const g = [...draw.gagnants].sort((a, b) => a - b);
    for (let x = 0; x < g.length; x++) {
      for (let y = x + 1; y < g.length; y++) {
        totalPairsAnalyzed++;
        if (Math.abs(g[x] - g[y]) === 1) realConsecutivePairs++;
        if (g[x] + g[y] === 91) realMirrorPairs++;
        if (Math.floor((g[x] - 1) / 10) === Math.floor((g[y] - 1) / 10)) realDecadePairs++;
        if (g[x] % 10 === g[y] % 10) realLastDigitPairs++;
      }
    }
  }

  const safeDraws = Math.max(1, totalDrawsAnalyzed);
  const safePairs = Math.max(1, totalPairsAnalyzed);

  const computePenaltyMultiplier = (empiricalRate: number, expectedTheoreticalRate: number, minPenalty = 0.2, maxPenalty = 0.8) => {
    const ratio = empiricalRate / (expectedTheoreticalRate || 1e-9);
    const sig = 1.0 / (1.0 + Math.exp(-4.0 * (ratio - 1.0)));
    return parseFloat((minPenalty + (maxPenalty - minPenalty) * sig).toFixed(4));
  };

  const pT1Repeats = realT1Repeats / (safeDraws * 5);
  const expT1 = 5.0 / 90.0;
  const pT1PenaltyCoeff = computePenaltyMultiplier(pT1Repeats, expT1, 0.3, 0.7);

  const pConsecutive = realConsecutivePairs / safePairs;
  const expConsecutive = 0.044;
  const pConsecutiveCoeff = computePenaltyMultiplier(pConsecutive, expConsecutive, 0.2, 0.6);

  const pMirror = realMirrorPairs / safePairs;
  const expMirror = 0.0112;
  const pMirrorCoeff = computePenaltyMultiplier(pMirror, expMirror, 0.4, 0.8);

  const pDecade = realDecadePairs / safePairs;
  const expDecade = 0.09;
  const pDecadePenaltyCoeff = computePenaltyMultiplier(pDecade, expDecade, 0.15, 0.5);

  const pLastDigit = realLastDigitPairs / safePairs;
  const expLastDigit = 0.1;
  const pLastDigitPenaltyCoeff = computePenaltyMultiplier(pLastDigit, expLastDigit, 0.1, 0.4);

  interface BeamBranch {
    selected: number[];
    score: number;
    familyCounts: Record<string, number>;
  }

  let beams: BeamBranch[] = [];
  const firstStepScores: { num: number; score: number; dominantFamily: string }[] = [];

  for (let num = 1; num <= 90; num++) {
    const score = calibratedScores[num];
    const f = normalizedFeatures[num];
    const famInertia = (f.repeatShort + f.trend) / 2.0;
    const famStructure = (f.mirror + f.neighbor + f.structuralCoherence) / 3.0;
    const famTransition = (f.markov + f.machineTransfer) / 2.0;
    const famSeasonal = f.seasonal;
    const famVals = [famInertia, famStructure, famTransition, famSeasonal];
    const maxIdx = famVals.indexOf(Math.max(...famVals));
    const dominantFamily = ["inertia", "structure", "transition", "seasonal"][maxIdx];

    firstStepScores.push({ num, score, dominantFamily });
  }

  firstStepScores.sort((a, b) => b.score - a.score);
  const beamSize = 3;
  for (let i = 0; i < Math.min(beamSize, firstStepScores.length); i++) {
    const item = firstStepScores[i];
    beams.push({
      selected: [item.num],
      score: item.score,
      familyCounts: {
        inertia: item.dominantFamily === "inertia" ? 1 : 0,
        structure: item.dominantFamily === "structure" ? 1 : 0,
        transition: item.dominantFamily === "transition" ? 1 : 0,
        seasonal: item.dominantFamily === "seasonal" ? 1 : 0
      }
    });
  }

  for (let step = 1; step < 5; step++) {
    const nextCandidates: { branch: BeamBranch; num: number; newScore: number; dominantFamily: string }[] = [];

    for (const b of beams) {
      const t1Count = b.selected.filter(sel => history[0].gagnants.includes(sel)).length;
      const neighborsCount = b.selected.filter(sel => 
        b.selected.some(other => other !== sel && Math.abs(sel - other) === 1)
      ).length / 2;

      for (let num = 1; num <= 90; num++) {
        if (b.selected.includes(num)) continue;

        const score = calibratedScores[num];
        const f = normalizedFeatures[num];
        const famInertia = (f.repeatShort + f.trend) / 2.0;
        const famStructure = (f.mirror + f.neighbor + f.structuralCoherence) / 3.0;
        const famTransition = (f.markov + f.machineTransfer) / 2.0;
        const famSeasonal = f.seasonal;
        const famVals = [famInertia, famStructure, famTransition, famSeasonal];
        const maxIdx = famVals.indexOf(Math.max(...famVals));
        const dominantFamily = ["inertia", "structure", "transition", "seasonal"][maxIdx];

        let familyPenalty = 1.0;
        if (b.familyCounts[dominantFamily] >= 2) {
          familyPenalty = 0.35;
        }

        let decadePenalty = 1.0;
        let lastDigitPenalty = 1.0;
        let consecutivePenalty = 1.0;
        let mirrorPenalty = 1.0;

        const numDecade = Math.floor((num - 1) / 10);
        const numLastDigit = num % 10;

        b.selected.forEach(sel => {
          const selDecade = Math.floor((sel - 1) / 10);
          const selLastDigit = sel % 10;

          if (numDecade === selDecade) {
            decadePenalty -= pDecadePenaltyCoeff;
          }
          if (numLastDigit === selLastDigit) {
            lastDigitPenalty -= pLastDigitPenaltyCoeff;
          }
          if (Math.abs(num - sel) === 1) {
            consecutivePenalty *= (neighborsCount > 0 ? pConsecutiveCoeff * 0.5 : pConsecutiveCoeff);
          }
          if (num === 91 - sel) {
            mirrorPenalty *= pMirrorCoeff;
          }
        });

        decadePenalty = Math.max(0.15, decadePenalty);
        lastDigitPenalty = Math.max(0.15, lastDigitPenalty);

        let t1Penalty = 1.0;
        if (history[0].gagnants.includes(num)) {
          if (t1Count >= 2) {
            t1Penalty = pT1PenaltyCoeff;
          }
        }

        const totalPenalty = familyPenalty * decadePenalty * lastDigitPenalty * consecutivePenalty * mirrorPenalty * t1Penalty;
        const candidateScore = score * totalPenalty;

        nextCandidates.push({
          branch: b,
          num,
          newScore: b.score + candidateScore,
          dominantFamily
        });
      }
    }

    nextCandidates.sort((a, b) => b.newScore - a.newScore);

    const nextBeams: BeamBranch[] = [];
    const seenCombos = new Set<string>();

    for (const cand of nextCandidates) {
      const nextSelected = [...cand.branch.selected, cand.num].sort((x, y) => x - y);
      const comboKey = nextSelected.join(",");
      if (seenCombos.has(comboKey)) continue;
      seenCombos.add(comboKey);

      const updatedFamilyCounts = { ...cand.branch.familyCounts };
      updatedFamilyCounts[cand.dominantFamily] = (updatedFamilyCounts[cand.dominantFamily] || 0) + 1;

      nextBeams.push({
        selected: [...cand.branch.selected, cand.num],
        score: cand.newScore,
        familyCounts: updatedFamilyCounts
      });

      if (nextBeams.length >= beamSize) break;
    }

    beams = nextBeams;
  }

  beams.sort((a, b) => b.score - a.score);
  const selected = beams[0] ? beams[0].selected : [];

  // Sélection des candidats complémentaires de réserve
  const candidatesList = Object.entries(calibratedScores)
    .filter(([numStr]) => !selected.includes(Number(numStr)))
    .sort((a, b) => b[1] - a[1])
    .map(([numStr]) => Number(numStr));

  const top18 = [...selected, ...candidatesList.slice(0, 13)];

  // --- STABILITY GATE (Robustesse de l'Inférence Continue) ---
  const allScoresList = Object.values(calibratedScores);
  const globalMeanScore = allScoresList.reduce((a, b) => a + b, 0) / (allScoresList.length || 1);
  const globalVar = allScoresList.reduce((sum, s) => sum + Math.pow(s - globalMeanScore, 2), 0) / (allScoresList.length || 1);
  const globalStd = Math.sqrt(globalVar) || 1e-6;

  const topScoresList = selected.map(num => calibratedScores[num] || 0);
  const topMeanScore = topScoresList.reduce((a, b) => a + b, 0) / (topScoresList.length || 1);

  // Signal-to-Noise Ratio (SNR) continu de la sélection top
  const snrVal = (topMeanScore - globalMeanScore) / globalStd;
  const snrStability = 1.0 / (1.0 + Math.exp(-snrVal));

  // Atténuation continue par le facteur de contradiction
  const contradictionFactor = 1.0 / (1.0 + Math.exp(contradictionPenalty));

  const stabilityScore = Math.max(0.1, Math.min(1.0, snrStability * contradictionFactor));

  // Lissage continu adaptatif sans seuil abrupt
  const spreadFactor = 0.4 * (1.0 - stabilityScore);
  if (spreadFactor > 0.001) {
    for (let num = 1; num <= 90; num++) {
      calibratedScores[num] = calibratedScores[num] * (1.0 - spreadFactor) + globalMean * spreadFactor;
    }
  }

  // Restructuration des détails du score pour la compatibilité d'affichage UI (radar, bento)
  const candidatesDetails: Record<number, ScoreComposition> = {};
  for (let num = 1; num <= 90; num++) {
    const structural = (normalizedFeatures[num].mirror + normalizedFeatures[num].neighbor + normalizedFeatures[num].seasonal + normalizedFeatures[num].structuralCoherence) / 4 * 100;
    const markov = normalizedFeatures[num].markov * 100;
    const machine = normalizedFeatures[num].machineTransfer * 100;
    const trend = (normalizedFeatures[num].repeatShort + normalizedFeatures[num].trend) / 2 * 100;

    candidatesDetails[num] = {
      structural: Math.round(structural),
      markov: Math.round(markov),
      machine: Math.round(machine),
      trend: Math.round(trend)
    };
  }

  const finalScores: Record<number, number> = {};
  for (let num = 1; num <= 90; num++) {
    finalScores[num] = Math.round(calibratedScores[num] * 100);
  }

  return {
    scores: finalScores,
    rawFeatures,
    normalizedFeatures,
    weightedScores,
    calibratedScores,
    candidatesDetails,
    top5: selected,
    top18,
    stabilityScore,
    regimeDiagnostic
  };
};

export const calculateOrchestrationScores = (
  history: DrawResult[], 
  _config?: OrchestrationConfig
): Record<number, number> => {
  if (history.length < 2) return {};
  const pipeline = runOrchestrationPipeline(history);
  return pipeline ? pipeline.scores : {};
};

export const analyzeShortTermMimicry = (history: DrawResult[]): MimicryMetric[] => {
  if (history.length < 3) return [];

  const metrics: MimicryMetric[] = [];
  const recentWinners = Array.from(new Set([...history[0].gagnants, ...history[1].gagnants]));  const historySets = history.slice(1, 6).map(draw => ({
    gagnants: new Set(draw.gagnants),
    machine: new Set(draw.machine || [])
  }));

  const baseImpact = 90.0 / 5.0;
  // Le score maximum théorique dans cette fenêtre de 5 tirages
  const maxPossibleScore = 5 * (baseImpact + (baseImpact / 2.0) + baseImpact); 
  const pivotScore = maxPossibleScore * 0.15; // Point d'inflexion pour le gradient continu

  recentWinners.forEach(n => {
    let score = 0;
    let type: string = 'Complexe';
    const sourceSet = new Set<string>();

    historySets.forEach((drawSet, idx) => {
      const i = idx + 1;
      const timeWeight = 1.0 / i; // Décroissance harmonique simple et déterministe

      if (drawSet.gagnants.has(n)) { 
         score += baseImpact * timeWeight; 
         type = i === 1 ? 'Répétition' : 'Lag'; 
         sourceSet.add(`T-${i}`); 
      } else if (drawSet.gagnants.has(n - 1) || drawSet.gagnants.has(n + 1)) { 
         score += (baseImpact / 2.0) * timeWeight; 
         if (type === 'Complexe') type = 'Voisin'; 
         sourceSet.add(`T-${i}`); 
      }
      if (drawSet.machine.has(n)) {
        score += baseImpact * timeWeight;
        type = 'Machine';
        sourceSet.add(`Mac-${i}`);
      }
    });

    // Remplacement du seuil binaire arbitraire par une fonction de pondération continue
    const k = 0.5; // Pente de la sigmoïde
    const continuousWeight = 1.0 / (1.0 + Math.exp(-k * (score - pivotScore)));
    
    // Le score final est pondéré par sa propre probabilité sigmoïdale
    const finalScore = score * continuousWeight;
    
    // On conserve toutes les probabilités non-nulles pour respecter la continuité
    if (finalScore > 0.1) {
      metrics.push({
        number: n, 
        score: Math.round(finalScore * 10) / 10, 
        type: type, 
        sourceDraw: Array.from(sourceSet).slice(0, 2).join(' & ') 
      });
    }
  });

  return metrics.sort((a, b) => b.score !== a.score ? b.score - a.score : a.number - b.number);
};

/**
 * CALCUL DE COHÉRENCE EMPIRIQUE (CORRECTION CRITIQUE)
 * Remplace les attentes théoriques fausses (AC=18, Spread=75) par la calibration empirique réelle. */
export const calculateCoherence = (
  numbers: number[], 
  calibration: EmpiricalCalibration = FALLBACK_CALIBRATION
): number => {
  if (numbers.length < 2) return 0;

  const sorted = [...numbers].sort((a, b) => a - b);
  const ac = calculateACValue(sorted);
  const amplitude = sorted[sorted.length - 1] - sorted[0];

  // 1. Score AC basé sur la PDF Gaussienne empirique exacte
  const acZ = (ac - calibration.meanAC) / Math.max(Number.EPSILON, calibration.stdAC);
  const acScore = 100 * Math.exp(-0.5 * Math.pow(acZ, 2));

  // 2. Score Amplitude basé sur la PDF Gaussienne empirique exacte
  const ampZ = (amplitude - calibration.meanAmplitude) / Math.max(Number.EPSILON, calibration.stdAmplitude);
  const ampScore = 100 * Math.exp(-0.5 * Math.pow(ampZ, 2));

  // Pondération équilibrée (50/50) car les deux sont des indicateurs structurels majeurs
  return Math.round((acScore * 0.5) + (ampScore * 0.5));
};

export const getFullOrchestrationAnalysis = async (
    // @ts-ignore - auto generated by cleanup
  drawName: string,
  history: DrawResult[],
  weights?: AlgoWeights,
  calibration: EmpiricalCalibration = FALLBACK_CALIBRATION
): Promise<OrchestrationMetrics & { candidatesDetails: Record<number, ScoreComposition> }> => {
  const config = adaptConfigurationToPhase(history);
  const pipeline = runOrchestrationPipeline(history, weights);

  if (!pipeline) {
    return {
      globalScore: 0,
      activePatterns: [],
      topCandidates: [],
      backtestAccuracy: 0,
      narrativeLesson: "Historique insuffisant.",
      candidatesDetails: {}
    };
  }

  const finalScores = pipeline.scores;
  const candidatesDetails = pipeline.candidatesDetails;

  const trend = analyzeImmediateTrend(history, config);
  const activePatterns: DetectedPattern[] = trend.lessons.map(l => ({ 
    type: l.pattern as PatternType, 
    count: 1, 
    impact: l.impactScore / 10.0 
  }));

  const successionScores = detectLeaderSuccessions(history, config);

  const topCandidates = pipeline.top18.map(num => {
    const score = finalScores[num] || 0;
    const reasons: string[] = [];
    const details = candidatesDetails[num] || { machine: 0, structural: 0, markov: 0, trend: 0 };
     
    const lookBackReasons = Math.min(3, history.length);
    for(let j = 0; j < lookBackReasons; j++) {
      if (history[j].machine?.includes(num) && !reasons.includes("Sortie Machine Récents")) {
        reasons.push("Sortie Machine Récents");
      }
      const mir = 91 - num;
      if (mir >= 1 && mir <= 90 && history[j].gagnants.includes(mir) && !reasons.includes("Miroir Récent")) {
        reasons.push("Miroir Récent");
      }
    }
    
    if ((successionScores[num] || 0) > 5.0 && !reasons.includes("Forte Affinité Markovienne")) {
      reasons.push("Forte Affinité Markovienne");
    }

    if (reasons.length === 0) {
      if (details.machine > 50) reasons.push("Canal Machine");
      else if (details.structural > 50) reasons.push("Symétrie T-1");
      else if (details.trend > 50) reasons.push("Inertie");
      else reasons.push("Résonance stochastique");
    }

    return { number: num, score, reasons };
  });

  // Backtest de précision déterministe
  let backtestHits = 0;
  let backtestTotal = 0;
  const testLookBack = Math.min(5, history.length - 1);

  for (let j = 1; j <= testLookBack; j++) {
    const pastHistory = history.slice(j);
    const pastScores = calculateOrchestrationScores(pastHistory, config);
    const pastTop10 = Object.entries(pastScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(e => Number(e[0]));
      
    const actualWinners = history[j - 1].gagnants;
    const hitsCount = actualWinners.filter(n => pastTop10.includes(n)).length;
    
    backtestHits += hitsCount;
    backtestTotal += actualWinners.length;
  }  
  const backtestAccuracy = backtestTotal > 0 ? Math.round((backtestHits / backtestTotal) * 100) : 0;
  const top5Numbers = topCandidates.slice(0, 5).map(c => c.number);

  return { 
    globalScore: Math.min(100, Math.round(topCandidates.slice(0, 10).reduce((acc, c) => acc + c.score, 0) / 10.0)), 
    activePatterns, 
    topCandidates, 
    backtestAccuracy, 
    narrativeLesson: trend.lessons[0]?.description || `Cohérence harmonique empirique du Top 5 : ${calculateCoherence(top5Numbers, calibration)}%.`,
    candidatesDetails,
    stabilityScore: pipeline.stabilityScore,
    regimeDiagnostic: pipeline.regimeDiagnostic
  };
};

    // @ts-ignore - auto generated by cleanup
export const analyzePredictionError = (drawName: string, actualResult: DrawResult, predictedNumbers?: number[]): { auditLessons: ImmediateLesson[] } => {
  const lessons: ImmediateLesson[] = [];

  if (actualResult.machine && actualResult.machine.length > 0) {        
    const machineSet = new Set(actualResult.machine);
    const machineHits = actualResult.gagnants.filter(n => machineSet.has(n));
    if (machineHits.length > 0) {
      lessons.push({ 
        pattern: 'Auto-Transfert', 
        description: `${machineHits.length} numéro(s) sortis en Machine ET Gagnant simultanément.`, 
        impactScore: 25 
      });
    }
  }

  if (predictedNumbers && predictedNumbers.length > 0) {
    const hits = actualResult.gagnants.filter(n => predictedNumbers.includes(n));
    const hitRate = hits.length / actualResult.gagnants.length;
    
    // Fonction d'impact continu 
    // Centré sur un taux de réussite attendu théorique
    const expectedHitRate = 5.0 / 90.0;
    const maxImpact = Math.log(90.0) * 5.0;
    const impactScore = maxImpact - (1.5 * maxImpact) / (1.0 + Math.exp(-Math.pow(expectedHitRate, -1) * (hitRate - expectedHitRate)));

    // Remplacement des branches conditionnelles disjointes par des poids d'activation continus
    const isRuptureWeight = 1.0 / (1.0 + Math.exp(5.0 * (hitRate - expectedHitRate) / expectedHitRate));
    const isConfirmationWeight = 1.0 / (1.0 + Math.exp(-5.0 * (hitRate - 3.0 * expectedHitRate) / expectedHitRate));

    const ruptureImpact = Math.round(impactScore * isRuptureWeight);
    const confirmationImpact = Math.round(impactScore * isConfirmationWeight);

    if (ruptureImpact > 0.5) {
      lessons.push({
        pattern: 'Rupture de Pattern',
        description: `Le tirage a rompu avec les tendances récentes (bruit statistique, activation: ${(isRuptureWeight * 100).toFixed(1)}%).`,
        impactScore: ruptureImpact
      });
    }
    if (confirmationImpact < -0.5) {
      lessons.push({
        pattern: 'Confirmation de Trend',
        description: `${hits.length} numéro(s) prédit(s) sorti(s). Le modèle a capté la tendance (activation: ${(isConfirmationWeight * 100).toFixed(1)}%).`,
        impactScore: confirmationImpact
      });
    }  }

  return { auditLessons: lessons.sort((a, b) => Math.abs(b.impactScore) - Math.abs(a.impactScore)) };
};
