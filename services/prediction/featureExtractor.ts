import { DrawResult } from '../../types';
import { globalTensorCache } from '../cache/lruTensorCache';
import { calculateFractalIndex, calculateShannonEntropy } from '../mathService';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';

export interface ExtractedFeatures {
  freqMap: Float32Array;
  gapsMap: Int32Array;
  markovMap: Float32Array;
  affinityMap: Float32Array[];
  momentumMap: Float32Array;
  machineTransferMap: Float32Array;
  shadowProbabilityMap: Float32Array;
  networkCorrelationMap: Float32Array;
  volatilityMap?: Float32Array;
  residualEntropyMap?: Float32Array;
}

// ============================================================================
// CONSTANTES TOPOLOGIQUES DU DOMAINE (Zéro Nombre Magique)
// ============================================================================
const DOMAIN_MIN = 1;
const DOMAIN_MAX = 90;
const DOMAIN_SIZE = DOMAIN_MAX - DOMAIN_MIN + 1; // 90

/**
 * Calcule la médiane d'un tableau de manière déterministe (O(N log N)).
 * Remplace les seuils arbitraires par une borne statistique robuste aux outliers.
 */
const calculateMedian = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Parse universellement des flux hétérogènes de numéros (tableaux, chaînes, entiers, objets).
 * Gère les séparateurs multiples (virgules, tirets, espaces, points-virgules), zéros de tête ("05")
 * et structures d'objets imbriquées.
 */
export const parseRawNumberArray = (raw: unknown): number[] => {
  if (raw === null || raw === undefined) return [];
  let result: number[] = [];
  if (Array.isArray(raw)) {
    result = raw
      .map(item => {
        if (typeof item === 'number') return item;
        if (typeof item === 'string') return parseInt(item.trim(), 10);
        if (item && typeof item === 'object') {
          const val = (item as any).num ?? (item as any).number ?? (item as any).val;
          return typeof val === 'number' ? val : parseInt(String(val), 10);
        }
        return NaN;
      })
      .filter(n => !isNaN(n) && Number.isFinite(n) && n >= DOMAIN_MIN && n <= DOMAIN_MAX);
  } else if (typeof raw === 'number') {
    result = raw >= DOMAIN_MIN && raw <= DOMAIN_MAX ? [raw] : [];
  } else if (typeof raw === 'string') {
    result = raw
      .split(/[\s,;\/\-]+/)
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && Number.isFinite(n) && n >= DOMAIN_MIN && n <= DOMAIN_MAX);
  } else if (typeof raw === 'object') {
    const candidate = (raw as any).numbers || (raw as any).gagnants || (raw as any).winningNumbers || (raw as any).machine || (raw as any).values;
    if (candidate) return parseRawNumberArray(candidate);
  }
  return Array.from(new Set(result));
};

/**
 * Extrait les numéros gagnants et de machine de façon extrêmement robuste.
 * Gère les types hétérogènes (number, array, string, objets imbriqués) et les clés alternatives (gagnants, numbers, winningNumbers, machine, machineNumbers).
 */
export const extractDrawNumbers = (draw: DrawResult): { winners: number[], machine: number[] } => {
  if (!draw) return { winners: [], machine: [] };
  const rawWinners = (draw as any).gagnants ?? (draw as any).numbers ?? (draw as any).winningNumbers;
  const rawMachine = (draw as any).machine ?? (draw as any).machineNumbers;
  const winners = parseRawNumberArray(rawWinners);
  const machine = parseRawNumberArray(rawMachine);
  return { winners, machine };
};

export const extractFeatures = async (
  drawName: string,
  history: DrawResult[], 
  sampleSize: number = history.length
): Promise<ExtractedFeatures> => {
  // Filtrage robuste selon la règle d'isolation (TIRAGE ISOLATION RULE)
  const filteredHistory = purifyHistoryForDraw(drawName, history);

  return globalTensorCache.getOrCompute(
    'features',
    drawName,
    filteredHistory,
    async () => {
      // ============================================================================
      // 0. FENÊTRE GLISSANTE ADAPTATIVE (N_eval) POUR HISTORIQUES COURTS (< 200 tirages)
      // ============================================================================
      let evalWindow = sampleSize;
      if (filteredHistory.length > 0 && filteredHistory.length < 200) {
        const tempH = calculateFractalIndex(filteredHistory);
        const tempE = calculateShannonEntropy(filteredHistory).normalized;
        const tempGapsMap = new Int32Array(DOMAIN_MAX + 1).fill(-1);
        for (let i = 0; i < Math.min(50, filteredHistory.length); i++) {
          const { winners } = extractDrawNumbers(filteredHistory[i]);
          for (const w of winners) {
            if (tempGapsMap[w] === -1) tempGapsMap[w] = i;
          }
        }
        const validG = Array.from(tempGapsMap).filter(g => g !== -1);
        const medG = validG.length > 0 ? calculateMedian(validG) : DOMAIN_SIZE / 6;
        const halfLife = Math.max(6, medG * (1.0 + (tempH - 0.5) + (1.0 - tempE)));
        const adaptiveDepth = Math.round(halfLife * (3.0 + 2.0 * tempH));
        evalWindow = Math.min(filteredHistory.length, Math.max(25, adaptiveDepth));
      }

      const recentHistory = filteredHistory.slice(0, Math.min(evalWindow, filteredHistory.length));
      
      // Initialisation des matrices avec des tailles strictement dérivées du domaine
      const freqMap = new Float32Array(DOMAIN_MAX + 1);
      const gapsMap = new Int32Array(DOMAIN_MAX + 1).fill(-1);
      const markovMap = new Float32Array(DOMAIN_MAX + 1);
      const machineTransferMap = new Float32Array(DOMAIN_MAX + 1);
      
      const affinityMap: Float32Array[] = Array.from({ length: DOMAIN_MAX + 1 }, () => new Float32Array(DOMAIN_MAX + 1));
      const momentumMap = new Float32Array(DOMAIN_MAX + 1);

      if (recentHistory.length === 0) {
        return {
          freqMap,
          gapsMap: gapsMap.map(() => 0),
          markovMap,
          affinityMap,
          momentumMap,
          machineTransferMap,
          shadowProbabilityMap: new Float32Array(DOMAIN_MAX + 1),
          networkCorrelationMap: new Float32Array(DOMAIN_MAX + 1)
        };
      }

      // ============================================================================
      // PRE-CALCUL DES GAPS POUR ESTIMATION DE LA DEMI-VIE
      // ============================================================================
      for (let i = 0; i < recentHistory.length; i++) {
        const { winners } = extractDrawNumbers(recentHistory[i]);
        for (const n of winners) {
          if (gapsMap[n] === -1) {
            gapsMap[n] = i;
          }
        }
      }

      // ============================================================================
      // 1. CALCUL DES PARAMÈTRES ADAPTATIFS DÉRIVÉS DES DONNÉES (Zéro Constante Arbitraire)
      // ============================================================================
      const h = calculateFractalIndex(filteredHistory); // Exposant de Hurst
      const e = calculateShannonEntropy(filteredHistory).normalized; // Entropie de Shannon [0, 1]

      // La demi-vie de l'information est dérivée de la médiane des écarts (gaps) observés.
      const validGaps = Array.from(gapsMap).filter(g => g !== -1);
      const medianGap = validGaps.length > 0 ? calculateMedian(validGaps) : DOMAIN_SIZE / 6;
      
      // Théorie de l'information : la demi-vie minimale est le log2 de la taille du domaine 
      const minTheoreticalHalfLife = Math.ceil(Math.log2(DOMAIN_SIZE)); 
      
      // Ajustement de la demi-vie par le régime de marché (Persistance vs Chaos)
      const regimeMultiplier = 1.0 + (h - 0.5) + (1.0 - e);
      const adaptiveHalfLife = Math.max(minTheoreticalHalfLife, medianGap * regimeMultiplier);

      // Constante de décroissance temporelle continue (Exponential Forgetting) rigoureuse
      const TIME_DECAY = Math.pow(0.5, 1.0 / adaptiveHalfLife);

      // Fenêtres d'analyse dynamiques, strictement proportionnelles à la demi-vie des données
      const momentumWindow = Math.floor(adaptiveHalfLife);

      // ============================================================================
      // 2. MODULE DE SYMBIOSE EXPLICITE (Machine <-> Gagnants) & PARCOURS TEMPOREL
      // ============================================================================
      // Matrice de transfert croisé Machine -> Gagnants (t+1 -> t)
      const machineToWinnersMatrix: Float32Array[] = Array.from({ length: DOMAIN_MAX + 1 }, () => new Float32Array(DOMAIN_MAX + 1));
      
      for (let i = 0; i < recentHistory.length - 1; i++) {
        const { machine: prevMachine } = extractDrawNumbers(recentHistory[i + 1]);
        const { winners: currWinners } = extractDrawNumbers(recentHistory[i]);
        if (prevMachine.length > 0 && currWinners.length > 0) {
          const decay = Math.pow(TIME_DECAY, i);
          for (const m of prevMachine) {
            for (const w of currWinners) {
              machineToWinnersMatrix[m][w] += decay;
            }
          }
        }
      }

      for (let i = 0; i < recentHistory.length; i++) {
        const draw = recentHistory[i];
        const { winners, machine } = extractDrawNumbers(draw);
        const decayWeight = Math.pow(TIME_DECAY, i);

        for (const n of winners) {
          freqMap[n] += decayWeight;
          if (gapsMap[n] === -1) gapsMap[n] = i;
          if (i < momentumWindow) momentumMap[n] += decayWeight;
        }

        // Injection continue d'énergie stochastique issue de la Symbiose Machine
        for (const m of machine) {
          let crossEnergy = 0;
          const row = machineToWinnersMatrix[m];
          if (row) {
            for (let w = DOMAIN_MIN; w <= DOMAIN_MAX; w++) {
              crossEnergy += row[w];
            }
          }
          const transferRatio = crossEnergy / (winners.length || 5);
          machineTransferMap[m] += decayWeight * (1.0 + Math.tanh(transferRatio));
        }
      }

      // Normalisation des gaps non trouvés à la borne supérieure statistique
      for (let i = DOMAIN_MIN; i <= DOMAIN_MAX; i++) { 
        if (gapsMap[i] === -1) gapsMap[i] = recentHistory.length; 
      }

      // ============================================================================
      // 3. MARKOV & AFFINITÉ À DOUBLE COUCHE (Probabilités Conditionnelles Rigoureuses)
      // M_total = M_gagnants + alpha_cross * M_machine
      // alpha_cross est calculé continûment par l'entropie de Shannon
      // ============================================================================
      const alphaCross = 0.5 / (1.0 + Math.exp(10.0 * (e - 0.5)));

      const markovWinnersMap: Float32Array[] = Array.from({ length: DOMAIN_MAX + 1 }, () => new Float32Array(DOMAIN_MAX + 1));
      const markovMachineMap: Float32Array[] = Array.from({ length: DOMAIN_MAX + 1 }, () => new Float32Array(DOMAIN_MAX + 1));

      const affinityWinnersMap: Float32Array[] = Array.from({ length: DOMAIN_MAX + 1 }, () => new Float32Array(DOMAIN_MAX + 1));
      const affinityMachineMap: Float32Array[] = Array.from({ length: DOMAIN_MAX + 1 }, () => new Float32Array(DOMAIN_MAX + 1));

      for (let i = 0; i < recentHistory.length - 1; i++) {
        const { winners: currentWinners, machine: currentMachine } = extractDrawNumbers(recentHistory[i]);
        const { winners: prevWinners, machine: prevMachine } = extractDrawNumbers(recentHistory[i+1]);
        const decayWeight = Math.pow(TIME_DECAY, i);
        
        // Couche Gagnants
        for (const p of prevWinners) {
          for (const c of currentWinners) {
            markovWinnersMap[p][c] += decayWeight;
          }
        }
        for (const c1 of currentWinners) {
          for (const c2 of currentWinners) {
            if (c1 !== c2) {
              affinityWinnersMap[c1][c2] += decayWeight;
            }
          }
        }

        // Couche Machine
        if (currentMachine.length > 0) {
          const pMachineList = prevMachine.length > 0 ? prevMachine : prevWinners;
          for (const p of pMachineList) {
            for (const c of currentMachine) {
              markovMachineMap[p][c] += decayWeight;
            }
          }
          for (const c1 of currentMachine) {
            for (const c2 of currentMachine) {
              if (c1 !== c2) {
                affinityMachineMap[c1][c2] += decayWeight;
              }
            }
          }
        }
      }

      // Fusion à Double Couche : M_total = M_gagnants + alpha_cross * M_machine
      const markovTransitionMap: Float32Array[] = Array.from({ length: DOMAIN_MAX + 1 }, () => new Float32Array(DOMAIN_MAX + 1));
      for (let p = DOMAIN_MIN; p <= DOMAIN_MAX; p++) {
        for (let c = DOMAIN_MIN; c <= DOMAIN_MAX; c++) {
          markovTransitionMap[p][c] = markovWinnersMap[p][c] + alphaCross * markovMachineMap[p][c];
          affinityMap[p][c] = affinityWinnersMap[p][c] + alphaCross * affinityMachineMap[p][c];
        }
      }

      // Normalisation Markov : Calcul Bayésien selon l'entropie locale du tirage
      let totalFreqSum = 0;
      for (let c = DOMAIN_MIN; c <= DOMAIN_MAX; c++) {
        totalFreqSum += freqMap[c];
      }

      const lambdaBayes = Math.max(0.1, 15.0 * Math.pow(e, 3));

      for (let p = DOMAIN_MIN; p <= DOMAIN_MAX; p++) {
        let total = 0;
        for (let c = DOMAIN_MIN; c <= DOMAIN_MAX; c++) total += markovTransitionMap[p][c];
        
        for (let c = DOMAIN_MIN; c <= DOMAIN_MAX; c++) {
          const priorC = totalFreqSum > 0 ? (freqMap[c] / totalFreqSum) : (1.0 / DOMAIN_SIZE);
          markovTransitionMap[p][c] = (markovTransitionMap[p][c] + lambdaBayes * priorC) / (total + lambdaBayes);
        }
      }

      // Normalisation Affinité : P(C2 | C1)
      for (let c1 = DOMAIN_MIN; c1 <= DOMAIN_MAX; c1++) {
        const freqC1 = freqMap[c1] || 1;
        for (let c2 = DOMAIN_MIN; c2 <= DOMAIN_MAX; c2++) {
          affinityMap[c1][c2] = affinityMap[c1][c2] / freqC1;
        }
      }

      // Calcul des probabilités Markov pour le prochain tirage
      const lastDraw = recentHistory[0] ? extractDrawNumbers(recentHistory[0]).winners : [];
      if (lastDraw.length > 0) {
        let maxMarkov = -Infinity;
        for (const lastNum of lastDraw) {
          for (let nextNum = DOMAIN_MIN; nextNum <= DOMAIN_MAX; nextNum++) {
            markovMap[nextNum] += markovTransitionMap[lastNum][nextNum];
          }
        }
        for (let nextNum = DOMAIN_MIN; nextNum <= DOMAIN_MAX; nextNum++) {
          markovMap[nextNum] = markovMap[nextNum] / lastDraw.length;
          if (markovMap[nextNum] > maxMarkov) maxMarkov = markovMap[nextNum];
        }

        // Température Softmax dérivée de l'entropie de Shannon locale :
      // T = 1 + H_normalized (H=0 → T=1 fort contraste, H=1 → T=2 lissage maximal)
      const MARKOV_TEMPERATURE = 1.0 + e;
      let sumSoftmax = 0;
        for (let nextNum = DOMAIN_MIN; nextNum <= DOMAIN_MAX; nextNum++) {
          markovMap[nextNum] = Math.exp((markovMap[nextNum] - maxMarkov) / MARKOV_TEMPERATURE);
          sumSoftmax += markovMap[nextNum];
        }
        for (let nextNum = DOMAIN_MIN; nextNum <= DOMAIN_MAX; nextNum++) {
          markovMap[nextNum] /= sumSoftmax;
        }
      }

      // ============================================================================
      // 4. CALCULS COMPLÉMENTAIRES (Shadow, Network)
      // ============================================================================
      const shadowProbabilityMap = new Float32Array(DOMAIN_MAX + 1);
      const networkCorrelationMap = new Float32Array(DOMAIN_MAX + 1);

      for (let n = DOMAIN_MIN; n <= DOMAIN_MAX; n++) {
        const gap = gapsMap[n];
        shadowProbabilityMap[n] = gap > 0 ? Math.min(1.0, gap / DOMAIN_SIZE) : 0.0;
        
        let affSum = 0;
        const affs = affinityMap[n];
        if (affs) {
          for (let c = DOMAIN_MIN; c <= DOMAIN_MAX; c++) {
            if (c !== n) affSum += affs[c];
          }
        }
        networkCorrelationMap[n] = affSum / DOMAIN_SIZE;
      }

      // ============================================================================
      // 5. INDICATEURS CLÉS ENRICHIS (Volatilité Locale & Entropie Résiduelle)
      // ============================================================================
      const volatilityMap = new Float32Array(DOMAIN_MAX + 1);
      const residualEntropyMap = new Float32Array(DOMAIN_MAX + 1);
      const windowLen = Math.max(1, recentHistory.length);

      for (let n = DOMAIN_MIN; n <= DOMAIN_MAX; n++) {
        const pOccur = freqMap[n] / (totalFreqSum || 1.0);
        const expectedGap = 1.0 / Math.max(1e-4, pOccur * DOMAIN_SIZE);
        const actualGap = gapsMap[n] >= 0 ? gapsMap[n] : windowLen;
        const gapDeviation = Math.abs(actualGap - expectedGap);
        volatilityMap[n] = parseFloat((gapDeviation / (expectedGap + gapDeviation)).toFixed(4));

        const pMarkov = markovMap[n] || (1.0 / DOMAIN_SIZE);
        const klLocal = pOccur > 0 ? pOccur * Math.log(Math.max(1e-6, pOccur / pMarkov)) : 0;
        residualEntropyMap[n] = parseFloat((1.0 / (1.0 + Math.exp(-klLocal))).toFixed(4));
      }

      return {
        freqMap,
        gapsMap,
        markovMap,
        affinityMap,
        momentumMap,
        machineTransferMap,
        shadowProbabilityMap,
        networkCorrelationMap,
        volatilityMap,
        residualEntropyMap
      };
    },
    `sample_${sampleSize}`
  );
};

/**
 * Calcule la volatilité statistique locale pour chaque numéro [1-90] à partir d'un historique de tirages.
 */
export const calculateVolatilityMap = (history: DrawResult[]): Record<number, number> => {
  const result: Record<number, number> = {};
  const total = Math.max(1, history.length);
  const counts = new Int32Array(DOMAIN_MAX + 1);
  const gaps = new Int32Array(DOMAIN_MAX + 1).fill(-1);

  for (let i = 0; i < history.length; i++) {
    const { winners } = extractDrawNumbers(history[i]);
    for (const w of winners) {
      if (w >= DOMAIN_MIN && w <= DOMAIN_MAX) {
        counts[w]++;
        if (gaps[w] === -1) gaps[w] = i;
      }
    }
  }

  for (let n = DOMAIN_MIN; n <= DOMAIN_MAX; n++) {
    const p = counts[n] / (total * 5);
    const expGap = 1.0 / Math.max(1e-4, p * DOMAIN_SIZE);
    const actGap = gaps[n] >= 0 ? gaps[n] : total;
    const dev = Math.abs(actGap - expGap);
    result[n] = parseFloat((dev / (expGap + dev)).toFixed(4));
  }
  return result;
};

/**
 * Calcule l'entropie résiduelle locale pour chaque numéro [1-90] à partir d'un historique de tirages.
 */
export const calculateResidualEntropyMap = (history: DrawResult[]): Record<number, number> => {
  const result: Record<number, number> = {};
  const total = Math.max(1, history.length);
  const counts = new Int32Array(DOMAIN_MAX + 1);

  for (const draw of history) {
    const { winners } = extractDrawNumbers(draw);
    for (const w of winners) {
      if (w >= DOMAIN_MIN && w <= DOMAIN_MAX) counts[w]++;
    }
  }

  for (let n = DOMAIN_MIN; n <= DOMAIN_MAX; n++) {
    const p = counts[n] / (total * 5);
    const pUniform = 1.0 / DOMAIN_SIZE;
    const kl = p > 0 ? p * Math.log(p / pUniform) : 0;
    result[n] = parseFloat((1.0 / (1.0 + Math.exp(-kl))).toFixed(4));
  }
  return result;
};
