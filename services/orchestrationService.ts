import { EmpiricalCalibration, FALLBACK_CALIBRATION } from "../shared/prediction.types";
import { DrawResult, DetectedPattern, PatternType, OrchestrationMetrics, MimicryMetric, ScoreComposition, AlgoWeights } from '../types';
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
  if (history.length < 10) return 15.0; // Fallback empirique moyen
  
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
    : 15.0;

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

export const calculateOrchestrationScores = (history: DrawResult[], config: OrchestrationConfig = adaptConfigurationToPhase(history)): Record<number, number> => {
  const scores: Record<number, number> = {};
  if (history.length < 2) return scores;

  const successionScores = detectLeaderSuccessions(history, config);
  Object.entries(successionScores).forEach(([n, s]) => scores[parseInt(n)] = (scores[parseInt(n)] || 0) + s);

  const lookBack = Math.min(Math.floor(config.adaptiveHalfLife), history.length);
  const baseImpact = 90.0 / 5.0;
  
  for (let i = 0; i < lookBack; i++) {
    const draw = history[i];
    const decay = Math.pow(config.timeDecay, i);

    draw.machine?.forEach(m => {
      scores[m] = (scores[m] || 0) + (baseImpact * config.machineWeight * decay);
    }); 

    draw.gagnants.forEach(w => {
      const mirror = 91 - w;
      if (mirror !== w && mirror >= 1 && mirror <= 90) {
        scores[mirror] = (scores[mirror] || 0) + (baseImpact * config.mirrorWeight * decay);
      }
      
      const nLeft = w > 1 ? w - 1 : 90;
      const nRight = w < 90 ? w + 1 : 1;
      scores[nLeft] = (scores[nLeft] || 0) + (baseImpact * config.neighborWeight * decay);
      scores[nRight] = (scores[nRight] || 0) + (baseImpact * config.neighborWeight * decay);
    });
  }

  return scores;
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
    // Sigmoïde centrée sur le pivot. Plus le score est haut, plus le poids s'approche de 1.
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
  
  // Coefficients dérivés des poids, bornés pour éviter l'explosion
  const coeffMachine = weights ? Math.min(2.0, 1.0 + (weights.spatial || 0)) : 1.0; 
  const coeffMarkov = weights ? Math.min(2.0, 1.0 + (weights.markov || 0)) : 1.0;
  const coeffStruct = weights ? Math.min(2.0, 1.0 + (weights.temporal || 0)) : 1.0;
  const coeffTrend = weights ? Math.min(2.0, 1.0 + (weights.frequency || 0)) : 1.0;

  const successionScores = detectLeaderSuccessions(history, config);
  const finalScores: Record<number, number> = {};
  const candidatesDetails: Record<number, ScoreComposition> = {};
  const lookBack = Math.min(Math.floor(config.adaptiveHalfLife), history.length); 

  for (let i = 1; i <= 90; i++) {
    const m_raw = successionScores[i] || 0;
    const markov = m_raw * coeffMarkov;

    let mac_raw = 0;
    for (let idx = 0; idx < lookBack; idx++) {
      if (history[idx].machine?.includes(i)) {
        mac_raw += (90.0 / 5.0) * Math.pow(config.timeDecay, idx);      }
    }
    const machine = mac_raw * coeffMachine;

    let struct_raw = 0;
    for (let idx = 0; idx < lookBack; idx++) {
      const draw = history[idx];
      const decay = Math.pow(config.timeDecay, idx);
      draw.gagnants.forEach(w => {
        const mirror = 91 - w;
        if (mirror === i && mirror >= 1 && mirror <= 90) struct_raw += (90.0 / 5.0) * config.mirrorWeight * decay;
        
        const nLeft = w > 1 ? w - 1 : 90;
        const nRight = w < 90 ? w + 1 : 1;
        if (nLeft === i) struct_raw += (90.0 / 5.0) * config.neighborWeight * decay;
        if (nRight === i) struct_raw += (90.0 / 5.0) * config.neighborWeight * decay;
      });
    }
    const structural = struct_raw * coeffStruct;

    let trend_raw = 0;
    for (let idx = 0; idx < lookBack; idx++) {
      if (history[idx].gagnants.includes(i)) {
        trend_raw += (90.0 / 5.0) * Math.pow(config.timeDecay, idx);
      }
    }
    const trendVal = trend_raw * coeffTrend;

    const total = structural + markov + machine + trendVal;
    
    if (total > 0) {
      finalScores[i] = total;
      candidatesDetails[i] = {
        structural: Math.round(structural),
        markov: Math.round(markov),
        machine: Math.round(machine),
        trend: Math.round(trendVal)
      };
    }
  }

  const trend = analyzeImmediateTrend(history, config);
  const activePatterns: DetectedPattern[] = trend.lessons.map(l => ({ 
    type: l.pattern as PatternType, 
    count: 1, 
    impact: l.impactScore / 10.0 
  }));

  const topCandidates = Object.entries(finalScores)
    .sort((a, b) => b[1] - a[1])    .slice(0, 18)
    .map(([numStr, score]) => {
      const num = Number(numStr);
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
      
      if (successionScores[num] > 5.0 && !reasons.includes("Forte Affinité Markovienne")) {
        reasons.push("Forte Affinité Markovienne");
      }

      if (reasons.length === 0) {
        if (details.machine > 5) reasons.push("Canal Machine");
        else if (details.structural > 5) reasons.push("Symétrie T-1");
        else if (details.trend > 5) reasons.push("Inertie");
        else reasons.push("Résonance stochastique");
      }

      return { number: num, score: Math.round(score), reasons };
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
    candidatesDetails
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
