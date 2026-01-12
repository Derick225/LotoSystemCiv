
import { PlatinumResult, PlatinumCombo, ScoreBreakdown, DrawResult, SpectralMetric } from '../types';
import { getAlgoWeights, generateMasterPrediction } from './predictionEngine';
import { calculateSpectralMetricsAsync } from './mathService';
import { fetchResults } from './lotteryService';

/**
 * Nexus MetaAnalyst v6.1 (Version Générique Adaptative)
 * Couche d'abstraction qui fusionne les signaux faibles pour générer des "Super Combinaisons".
 * S'adapte automatiquement aux régimes statistiques de chaque tirage.
 */

const PLATINUM_STORAGE_KEY = 'lotopro_platinum_history';

export interface StrategyBias {
    stability: number; // Poids donné aux stats long terme (Momentum)
    chaos: number;     // Poids donné à l'entropie et à la vélocité (Rupture)
    harmony: number;   // Poids donné à la résonance spectrale (Cycle)
}

interface PositionalBehavior {
  position: number;
  regimeType: 'persistent' | 'anti_persistent' | 'chaotic';
  hurst: number;
  cycleType: 'bimodal' | 'persistent' | 'chaotic';
  confidence: number;
  extremesFrequency: number;
  lastValue: number;
}

interface PositionalCorrelation {
  positions: number[];
  correlation: number;
  avgDifference: number;
  frequencyClose: number;
}

// Cache avec timestamp pour éviter de recalculer si les données n'ont pas changé
const SCORE_CACHE = new Map<string, { data: Record<number, ScoreBreakdown>, ts: number }>();

export const precomputeBaseScores = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: any
): Promise<Record<number, ScoreBreakdown>> => {
    const now = Date.now();
    const cached = SCORE_CACHE.get(drawName);
    
    // Cache valide 1 heure
    if (cached && (now - cached.ts < 3600000)) {
        return cached.data;
    }
    
    const weights = await getAlgoWeights(drawName);
    // On appelle le moteur de prédiction standard pour avoir les scores bruts par numéro
    const masterPred = await generateMasterPrediction(drawName, history, weights, metrics);
    
    const data = masterPred.breakdown || {};
    SCORE_CACHE.set(drawName, { data, ts: now });
    return data;
};

export const savePlatinumHistory = (result: PlatinumResult) => {
    try {
        const raw = localStorage.getItem(PLATINUM_STORAGE_KEY);
        const history = raw ? JSON.parse(raw) : [];
        const updated = [result, ...history.filter((r: any) => r.drawName === result.drawName)].slice(0, 50);
        localStorage.setItem(PLATINUM_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
        console.warn("Storage quota exceeded for Platinum history", e);
    }
};

// --- MATH HELPERS FOR ADAPTIVE BIAS ---

const calculateMean = (data: number[]) => data.reduce((a, b) => a + b, 0) / (data.length || 1);

const calculateSeriesVolatility = (values: number[]): number => {
    if (values.length < 2) return 0;
    const mean = calculateMean(values);
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    // Normalisation approximative (Ecart-type max théorique pour 1-90 est ~26)
    return Math.min(1, stdDev / 25);
};

const calculateHurstForSeries = (values: number[]): number => {
    const N = values.length;
    if (N < 10) return 0.5;
    const mean = calculateMean(values);
    const y = values.map(x => x - mean);
    let cumsum = 0;
    const cumDev = y.map(val => { cumsum += val; return cumsum; });
    
    const R = Math.max(...cumDev) - Math.min(...cumDev);
    const S = Math.sqrt(values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / N) || 1;
    
    if (R === 0 || S === 0) return 0.5;
    const hurst = Math.log(R / S) / Math.log(N);
    return Math.max(0, Math.min(1, hurst));
};

const detectSeriesCycles = (values: number[]) => {
    if (values.length < 5) return { strength: 0 };
    const mean = calculateMean(values);
    let num = 0, den = 0;
    // Autocorrélation Lag-1
    for (let i = 0; i < values.length - 1; i++) {
        num += (values[i] - mean) * (values[i+1] - mean);
        den += Math.pow(values[i] - mean, 2);
    }
    const correlation = den === 0 ? 0 : num / den;
    return { strength: Math.abs(correlation) };
};

const detectGlobalCycles = (values: number[]) => {
    return detectSeriesCycles(values);
};

const detectPositionalCycles = (values: number[]) => {
    const cycle = detectSeriesCycles(values);
    return { strength: cycle.strength };
};

/**
 * Analyse le comportement statistique par position (G1 à G5)
 */
const analyzePositionalBehavior = (history: DrawResult[]): PositionalBehavior[] => {
  return Array.from({ length: 5 }, (_, posIndex) => {
    const positionValues = history.map(h => h.gagnants[posIndex]);
    const hurst = calculateHurstForSeries(positionValues);
    
    // Détection de régimes bimodaux extrêmes
    const sortedValues = [...positionValues].sort((a, b) => a - b);
    
    const extremeLowCount = positionValues.filter(v => v <= 15).length;
    const extremeHighCount = positionValues.filter(v => v >= 75).length;
    const extremesFrequency = (extremeLowCount + extremeHighCount) / positionValues.length;
    
    let cycleType: 'bimodal' | 'persistent' | 'chaotic' = 'chaotic';
    let confidence = 0.5;
    
    if (hurst > 0.65) {
      cycleType = 'persistent';
      confidence = (hurst - 0.65) * 2;
    } else if (extremesFrequency > 0.6 && Math.abs(extremeLowCount - extremeHighCount) < positionValues.length * 0.3) {
      cycleType = 'bimodal';
      confidence = extremesFrequency * 0.9;
    }
    
    return {
      position: posIndex + 1,
      regimeType: hurst > 0.6 ? 'persistent' : hurst < 0.4 ? 'anti_persistent' : 'chaotic',
      hurst,
      cycleType,
      confidence,
      extremesFrequency,
      lastValue: positionValues[0] || 0
    };
  });
};

/**
 * Détecte les corrélations entre positions (ex: G4 et G5 souvent proches)
 */
const detectPositionalCorrelations = (history: DrawResult[]): PositionalCorrelation[] => {
  const correlations: PositionalCorrelation[] = [];
  
  // Analyse des paires de positions
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      const diffs = history.map(h => Math.abs(h.gagnants[i] - h.gagnants[j]));
      const avgDiff = diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1);
      
      // Si les positions sont souvent proches (diff < 12) et stablement proches
      const closeFrequency = diffs.filter(d => d < 15).length / (diffs.length || 1);
      
      if (avgDiff < 12 && closeFrequency > 0.7) {
        const correlationStrength = 1 - (avgDiff / 90);
        correlations.push({
          positions: [i+1, j+1],
          correlation: correlationStrength,
          avgDifference: avgDiff,
          frequencyClose: closeFrequency
        });
      }
    }
  }
  
  return correlations.sort((a, b) => b.correlation - a.correlation);
};

/**
 * Calcule la volatilité par position
 */
const calculatePositionalVolatility = (history: DrawResult[]) => {
  return Array.from({ length: 5 }, (_, posIndex) => {
    const values = history.map(h => h.gagnants[posIndex]);
    const volatility = calculateSeriesVolatility(values);
    
    return { 
      position: posIndex + 1,
      score: volatility * 100,  // Normalisation 0-100
      confidence: Math.min(1.0, history.length / 50)
    };
  });
};

/**
 * Détecte les patterns cycliques dans l'historique
 */
const detectCyclePatterns = (history: DrawResult[]) => {
  // Analyse globale et par position
  const globalCycles = detectGlobalCycles(history.flatMap(h => h.gagnants));
  
  const positionalCycles = Array.from({ length: 5 }, (_, posIndex) => {
    const values = history.map(h => h.gagnants[posIndex]);
    return detectSeriesCycles(values);
  });
  
  return {
    globalStrength: globalCycles.strength,
    positionalStrength: positionalCycles.map(c => c.strength),
    dominantPositions: positionalCycles
      .map((c, i) => ({ position: i+1, strength: c.strength }))
      .filter(p => p.strength > 0.7)
      .sort((a, b) => b.strength - a.strength)
  };
};

/**
 * Calcule automatiquement le biais utilisateur optimal selon le profil statistique du tirage.
 * Version générique qui ne dépend pas des noms de jeux.
 */
export const calculateOptimalUserBias = (
  _drawName: string, 
  history: DrawResult[]
): StrategyBias => {
  if (history.length < 15) {
    // Valeurs par défaut neutres pour les jeux avec peu d'historique
    return { stability: 0.5, chaos: 0.3, harmony: 0.5 };
  }

  // Analyse mathématique pure des régimes statistiques
  const positionalAnalysis = analyzePositionalBehavior(history);
  const volatilityProfile = calculatePositionalVolatility(history);
  // Unused but kept for future: const cycleStrength = detectCyclePatterns(history);
  
  // Calcul dynamique basé sur les caractéristiques statistiques
  let stability = 0.5;
  let chaos = 0.3;
  let harmony = 0.5;

  // 1. Adaptation basée sur la volatilité positionnelle
  const avgVolatility = volatilityProfile.reduce((sum, v) => sum + v.score, 0) / 5;
  
  if (avgVolatility > 70) {
    // Régime chaotique - favoriser la détection de ruptures
    stability = Math.max(0.2, 0.5 - (avgVolatility - 70) / 200);
    chaos = Math.min(0.8, 0.3 + (avgVolatility - 70) / 150);
  } else if (avgVolatility < 30) {
    // Régime stable - favoriser la persistance
    stability = Math.min(0.8, 0.5 + (30 - avgVolatility) / 100);
    chaos = Math.max(0.1, 0.3 - (30 - avgVolatility) / 150);
  }

  // 2. Détection de cycles binaires extrêmes (important pour G3)
  const extremeBimodalPositions = positionalAnalysis.filter(pos => 
    pos.cycleType === 'bimodal' && pos.confidence > 0.8 && pos.extremesFrequency > 0.6
  );
  
  if (extremeBimodalPositions.length >= 1) {
    // Renforcement du chaos pour capturer les inversions extrêmes
    chaos = Math.min(0.85, chaos * 1.5 + 0.2);
    // Réduction de la stabilité car les cycles ne sont pas persistants
    stability = Math.max(0.15, stability * 0.6);
  }

  // 3. Détection de persistance par position (important pour G4/G5)
  const persistentPositions = positionalAnalysis.filter(pos => 
    pos.regimeType === 'persistent' && pos.hurst > 0.65 && pos.confidence > 0.75
  );
  
  if (persistentPositions.length >= 2) {
    // Renforcement de l'harmonie pour les régimes cycliques stables
    harmony = Math.min(0.85, harmony * 1.3 + 0.15);
    // Renforcement de la stabilité
    stability = Math.min(0.8, stability * 1.2 + 0.1);
  }

  // 4. Détection de paires positionnelles corrélées (ex: G4/G5)
  const correlatedPairs = detectPositionalCorrelations(history);
  if (correlatedPairs.length > 0 && correlatedPairs.some(pair => pair.correlation > 0.7)) {
    harmony = Math.min(0.8, harmony * 1.4);
  }

  return { 
    stability: parseFloat(stability.toFixed(2)), 
    chaos: parseFloat(chaos.toFixed(2)), 
    harmony: parseFloat(harmony.toFixed(2)) 
  };
};

/**
 * Calcule l'affinité de succession : Quels numéros (et leurs voisins) sortent le plus souvent
 * après les numéros du dernier tirage ?
 */
const calculatePostDrawAffinity = (history: DrawResult[], lastDraw: DrawResult): Record<number, number> => {
    const scores: Record<number, number> = {};
    for(let i=1; i<=90; i++) scores[i] = 0;

    if (history.length < 10) return scores;

    const depth = Math.min(history.length - 1, 150);
    const lastWinners = lastDraw.gagnants;
    const lastMachine = lastDraw.machine || [];
    const lastMirrors = lastWinners.map(n => 91 - n);

    for (let i = 1; i < depth; i++) {
        const pastDraw = history[i];
        const nextDraw = history[i-1];

        const winMatches = pastDraw.gagnants.filter(n => lastWinners.includes(n));
        const macMatches = (pastDraw.machine || []).filter(n => lastMachine.includes(n));
        const mirrorMatches = pastDraw.gagnants.filter(n => lastMirrors.includes(n));

        let contextWeight = 0;
        if (winMatches.length > 0) contextWeight += Math.pow(winMatches.length, 1.5) * 1.5;
        if (macMatches.length > 0) contextWeight += macMatches.length * 0.8;
        if (mirrorMatches.length > 0) contextWeight += mirrorMatches.length * 1.2;

        if (contextWeight > 0) {
            nextDraw.gagnants.forEach(nextNum => {
                scores[nextNum] = (scores[nextNum] || 0) + (10 * contextWeight);
                const nPlus = nextNum === 90 ? 1 : nextNum + 1;
                const nMinus = nextNum === 1 ? 90 : nextNum - 1;
                scores[nPlus] = (scores[nPlus] || 0) + (2 * contextWeight);
                scores[nMinus] = (scores[nMinus] || 0) + (2 * contextWeight);
            });
        }
    }

    const maxVal = Math.max(...Object.values(scores), 1);
    for(let i=1; i<=90; i++) {
        scores[i] = (scores[i] / maxVal) * 100;
    }

    return scores;
};

const isValidAddition = (currentCombo: number[], newNum: number): boolean => {
    if (currentCombo.includes(newNum)) return false;
    const nextCombo = [...currentCombo, newNum].sort((a, b) => a - b);
    if (nextCombo.length >= 4) {
        const sum = nextCombo.reduce((a, b) => a + b, 0);
        if (nextCombo.length === 5 && (sum < 130 || sum > 330)) return false;
        if (nextCombo.length === 4 && sum > 300) return false;
    }
    let consecutiveCount = 0;
    let hasTriple = false;
    for (let i = 0; i < nextCombo.length - 1; i++) {
        if (nextCombo[i+1] === nextCombo[i] + 1) {
            consecutiveCount++;
            if (i < nextCombo.length - 2 && nextCombo[i+2] === nextCombo[i] + 2) {
                hasTriple = true;
            }
        }
    }
    if (hasTriple) return false;
    if (consecutiveCount > 2) return false;
    const decades = nextCombo.map(n => Math.floor((n - 1) / 10));
    const decadeCounts = decades.reduce((acc, d) => { acc[d] = (acc[d] || 0) + 1; return acc; }, {} as Record<number, number>);
    if (Object.values(decadeCounts).some(c => c > 3)) return false;
    if (nextCombo.length === 5) {
        const odds = nextCombo.filter(n => n % 2 !== 0).length;
        if (odds === 0 || odds === 5) return false; 
    }
    return true;
};

export async function generatePlatinumPrediction(
    drawName: string, 
    history?: DrawResult[],
    precomputedMetrics?: any,
    userBias: StrategyBias = { stability: 0.5, chaos: 0.3, harmony: 0.2 }
): Promise<PlatinumResult> {
    const data = history || (await fetchResults(drawName)).data;
    if (data.length < 20) throw new Error("Historique insuffisant pour la fusion.");

    const scores = await precomputeBaseScores(drawName, data, precomputedMetrics);
    const successionScores = calculatePostDrawAffinity(data, data[0]);

    const combinations: PlatinumCombo[] = [];
    const pool = Object.keys(scores).map(Number);

    let attempts = 0;
    const MAX_ATTEMPTS = 500;

    while (combinations.length < 5 && attempts < MAX_ATTEMPTS) {
        attempts++;
        const combo: number[] = [];
        const tempPool = [...pool];
        
        let abortTicket = false;

        while (combo.length < 5 && tempPool.length > 0) {
            let bestCandidate = -1;
            let bestVal = -Infinity;
            const tournamentSize = 8 + Math.floor(userBias.chaos * 10);

            for(let k=0; k < tournamentSize; k++) { 
                if (tempPool.length === 0) break;
                const idx = Math.floor(Math.random() * tempPool.length);
                const n = tempPool[idx];
                const b = scores[n];
                const succScore = successionScores[n] || 0;
                
                const val = ((b.spectral || 0) * userBias.harmony) + 
                            ((b.momentum || 0) * userBias.stability) + 
                            ((b.gap || 0) * userBias.chaos * 0.5) +
                            (succScore * 0.7);
                
                const noise = (Math.random() - 0.5) * (userBias.chaos * 20);

                if ((val + noise) > bestVal) {
                    if (isValidAddition(combo, n)) {
                        bestVal = val + noise;
                        bestCandidate = n;
                    }
                }
            }
            
            if (bestCandidate !== -1) {
                combo.push(bestCandidate);
                const removeIdx = tempPool.indexOf(bestCandidate);
                if (removeIdx !== -1) tempPool.splice(removeIdx, 1);
            } else {
                abortTicket = true; 
                break; 
            }
        }
        
        if (!abortTicket && combo.length === 5) {
            combo.sort((a,b) => a-b);
            const comboStr = combo.join('-');
            const exists = combinations.some(c => c.numbers.join('-') === comboStr);
            
            if (!exists) {
                let totalScore = 0;
                combo.forEach(n => {
                    const b = scores[n];
                    const succ = successionScores[n] || 0;
                    totalScore += (b.spectral || 0) * 0.3 + (b.momentum || 0) * 0.3 + (succ * 0.4);
                });
                const normalizedScore = Math.min(100, Math.round(totalScore / 5 * 1.1));

                combinations.push({
                    numbers: combo,
                    score: normalizedScore,
                    tags: ["Platinum v6", "Structure+"],
                    breakdown: { 
                        harmony: Math.round(userBias.harmony * 100), 
                        stability: Math.round(userBias.stability * 100), 
                        chaos: Math.round(userBias.chaos * 100), 
                        pattern: Math.round(normalizedScore * 0.8) 
                    }
                });
            }
        }
    }

    const freqMap: Record<number, number> = {};
    combinations.forEach(c => c.numbers.forEach(n => freqMap[n] = (freqMap[n] || 0) + 1));
    const kingNumbers = Object.entries(freqMap)
        .map(([n, c]) => ({ number: Number(n), count: c }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const spectralMetrics = precomputedMetrics?.spectral || await calculateSpectralMetricsAsync(data);
    const hotZonesSpectro = spectralMetrics.slice(0, 10).map((m: SpectralMetric) => m.number);

    return {
        kingNumbers, 
        targetSumRange: { min: 130, max: 330, reason: "Filtre Gaussien v6" },
        hotZonesSpectro,
        combinations: combinations.sort((a, b) => b.score - a.score),
        confidence: 92, 
        analysis: `Synthèse Platinum v6 Adaptative : Biais H${(userBias.harmony*100).toFixed(0)} S${(userBias.stability*100).toFixed(0)} C${(userBias.chaos*100).toFixed(0)}.`,
        drawName,
        timestamp: Date.now()
    };
}
