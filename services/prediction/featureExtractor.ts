import { DrawResult } from '../../types';
import { globalCache, CACHE_TTL } from '../cache/CacheService';
import { calculateFractalIndex, calculateShannonEntropy } from '../mathService';
import { analyzeDecadePatterns, getDecadeIndex } from './decadePatternService';

export interface ExtractedFeatures {
  freqMap: Float32Array;
  gapsMap: Int32Array;
  markovMap: Float32Array;
  affinityMap: Float32Array[];
  momentumMap: Float32Array;
  machineTransferMap: Float32Array;
  equilibriumMap: Float32Array;
  antiConsensusMap: Float32Array;
  shadowProbabilityMap: Float32Array;
  networkCorrelationMap: Float32Array;
  decadePatternMap: Float32Array;
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
  // filtrage strict par drawName (TIRAGE ISOLATION RULE), sauf pour les pseudo-tirages
  // agrégés "ALL" / "ALL_COMBINED" utilisés par le prior macro de shrinkage James-Stein
  // (voir predictionFacade.ts). Sans ce cas spécial, le filtre exact sur drawName ne
  // trouve jamais aucune ligne nommée littéralement "ALL_COMBINED" et le prior macro
  // tourne silencieusement sur un historique vide (0 tirage), ce qui désactive de fait
  // la régularisation bayésienne sans jamais lever d'erreur.
  const normalizedDrawName = drawName ? drawName.trim().toLowerCase() : "";
  const isAggregatePseudoDraw = normalizedDrawName === "all" || normalizedDrawName === "all_combined";
  const filteredHistory = (drawName && !isAggregatePseudoDraw)
    ? history.filter(d => d.drawName === drawName)
    : history;
  const cacheKey = globalCache.generateKey('features', drawName, `${filteredHistory.length}_${filteredHistory[0]?.date || 'nodate'}`);

  return globalCache.getOrCompute(
    cacheKey,
    async () => {
      const recentHistory = filteredHistory.slice(0, Math.min(sampleSize, filteredHistory.length));
      
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
          equilibriumMap: new Float32Array(DOMAIN_MAX + 1).fill(50),
          antiConsensusMap: new Float32Array(DOMAIN_MAX + 1),
          shadowProbabilityMap: new Float32Array(DOMAIN_MAX + 1),
          networkCorrelationMap: new Float32Array(DOMAIN_MAX + 1),
          decadePatternMap: new Float32Array(DOMAIN_MAX + 1)
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
      // 2. PARCOURS TEMPorel AVEC DÉCROISSANCE EXPONENTIELLE
      // ============================================================================
      for (let i = 0; i < recentHistory.length; i++) {
        const draw = recentHistory[i];
        const { winners, machine } = extractDrawNumbers(draw);
        const decayWeight = Math.pow(TIME_DECAY, i);

        for (const n of winners) {
          freqMap[n] += decayWeight;
          if (gapsMap[n] === -1) gapsMap[n] = i;
          if (i < momentumWindow) momentumMap[n] += decayWeight;
        }

        for (const m of machine) {
          machineTransferMap[m] += decayWeight;
        }
      }

      // Normalisation des gaps non trouvés à la borne supérieure statistique
      for (let i = DOMAIN_MIN; i <= DOMAIN_MAX; i++) { 
        if (gapsMap[i] === -1) gapsMap[i] = recentHistory.length; 
      }

      // ============================================================================
      // 3. MARKOV & AFFINITÉ (Probabilités Conditionnelles Rigoureuses)
      // ============================================================================
      const markovTransitionMap: Float32Array[] = Array.from({ length: DOMAIN_MAX + 1 }, () => new Float32Array(DOMAIN_MAX + 1));

      for (let i = 0; i < recentHistory.length - 1; i++) {
        const { winners: current } = extractDrawNumbers(recentHistory[i]);
        const { winners: prev } = extractDrawNumbers(recentHistory[i+1]);
        const decayWeight = Math.pow(TIME_DECAY, i);
        
        for (const p of prev) {
          for (const c of current) {
            markovTransitionMap[p][c] += decayWeight;
          }
        }

        for (const c1 of current) {
          for (const c2 of current) {
            if (c1 !== c2) {
              affinityMap[c1][c2] += decayWeight;
            }
          }
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
        for (const lastNum of lastDraw) {
          for (let nextNum = DOMAIN_MIN; nextNum <= DOMAIN_MAX; nextNum++) {
            markovMap[nextNum] += markovTransitionMap[lastNum][nextNum];
          }
        }
        for (let nextNum = DOMAIN_MIN; nextNum <= DOMAIN_MAX; nextNum++) {
          markovMap[nextNum] = markovMap[nextNum] / lastDraw.length;
        }
      }

      // ============================================================================
      // 4. CALCULS COMPLÉMENTAIRES (Equilibrium, AntiConsensus, Shadow, Network)
      // ============================================================================
      const equilibriumMap = new Float32Array(DOMAIN_MAX + 1).fill(50.0);
      const expectedFreq = (recentHistory.length * 5) / DOMAIN_SIZE;
      for (let n = DOMAIN_MIN; n <= DOMAIN_MAX; n++) {
        const diff = freqMap[n] - expectedFreq;
        equilibriumMap[n] = Math.max(10, Math.min(90, 50.0 + diff * 15.0));
      }

      const antiConsensusMap = new Float32Array(DOMAIN_MAX + 1);
      const shortWindow = Math.min(5, recentHistory.length);
      for (let i = 0; i < shortWindow; i++) {
        const { winners } = extractDrawNumbers(recentHistory[i]);
        for (const n of winners) {
          antiConsensusMap[n] += 1;
        }
      }

      const shadowProbabilityMap = new Float32Array(DOMAIN_MAX + 1);
      const networkCorrelationMap = new Float32Array(DOMAIN_MAX + 1);
      const decadePatternMap = new Float32Array(DOMAIN_MAX + 1);

      // Calcul des décennies de façon centralisée
      const decadeAnalysis = analyzeDecadePatterns(drawName, filteredHistory);

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

        const d = getDecadeIndex(n);
        decadePatternMap[n] = decadeAnalysis.projectedTemporalScore[d];
      }

      return {
        freqMap,
        gapsMap,
        markovMap,
        affinityMap,
        momentumMap,
        machineTransferMap,
        equilibriumMap,
        antiConsensusMap,
        shadowProbabilityMap,
        networkCorrelationMap,
        decadePatternMap
      };
    },
    CACHE_TTL.MEDIUM,
    drawName
  );
};
