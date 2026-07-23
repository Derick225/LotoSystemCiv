import { DrawResult } from '../../types';
import { globalCache, CACHE_TTL } from '../cache/CacheService';
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
 * Extrait les numéros gagnants et de machine de façon extrêmement robuste.
 * Gère les types hétérogènes (number, array, string).
 */
export const extractDrawNumbers = (draw: DrawResult): { winners: number[], machine: number[] } => {
  const winners = Array.isArray(draw.gagnants) ? draw.gagnants : [];
  let machine: number[] = [];
  if (draw.machine) {
    if (Array.isArray(draw.machine)) {
      machine = draw.machine;
    } else if (typeof draw.machine === 'number') {
      machine = [draw.machine];
    } else if (typeof draw.machine === 'string') {
      machine = String(draw.machine).split(',').map(Number).filter(n => !isNaN(n) && n >= DOMAIN_MIN && n <= DOMAIN_MAX);
    }
  }
  return { 
    winners: winners.filter(n => n >= DOMAIN_MIN && n <= DOMAIN_MAX), 
    machine: machine.filter(n => n >= DOMAIN_MIN && n <= DOMAIN_MAX) 
  };
};

export const extractFeatures = async (
  drawName: string,
  history: DrawResult[], 
  sampleSize: number = history.length
): Promise<ExtractedFeatures> => {
  // Filtrage robuste selon la règle d'isolation (TIRAGE ISOLATION RULE)
  const filteredHistory = purifyHistoryForDraw(drawName, history);
  const cacheKey = globalCache.generateKey('features', drawName, `${filteredHistory.length}_${filteredHistory[0]?.date || 'nodate'}`);

  return globalCache.getOrCompute(
    cacheKey,
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

        // ============================================================================
        // Température Softmax de la Matrice de Markov (T = 1.3)
        // Accentue le contraste entre les transitions à haute probabilité et le bruit
        // ============================================================================
        const MARKOV_TEMPERATURE = 1.3;
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

      return {
        freqMap,
        gapsMap,
        markovMap,
        affinityMap,
        momentumMap,
        machineTransferMap,
        shadowProbabilityMap,
        networkCorrelationMap
      };
    },
    CACHE_TTL.MEDIUM,
    drawName
  );
};
