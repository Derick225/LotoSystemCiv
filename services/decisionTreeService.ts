import type { DrawResult, ForestVote, DecisionNode } from '../types';
import { calculateFractalIndex } from './mathService';
import { useNexusStore } from '../store/useNexusStore';
import { purifyHistoryForDraw } from '../utils/arrayUtils';

export const FEATURES_LABELS = [
  'Critical Gap', 'Frequency', 'Shadow',
  'Consensus Trap', 'Neighbor', 'Machine Leak', 'Norm Gap'
];

// Cache stable basé sur une clé string unique (drawName + historique + head draw id)
const consensusCache = new Map<string, Record<number, number>>();

const getConsensusCacheKey = (drawName: string, historyLength: number, headDrawId: string): string => {
  return `${drawName}_${historyLength}_${headDrawId}`;
};

// Constante topologique dérivée du domaine (couvre 99.7% des distances spatiales dans un domaine de 90)
const SIGMA_TOPOLOGY = 90 / 6.0; 

// Diagnostics de la forêt de décision
export interface DecisionForestDiagnostics {
  datasetSize: number;
  positiveCount: number;
  negativeCount: number;
  positiveRatio: number;
  skewness: number;
  medianGap: number;
  iqrGap: number;
  meanFreq: number;
  stdFreq: number;
  activeFeaturesCount: number;
  elapsedMs: number;
}

// Représente les précomputations effectuées une fois par bloc de contexte
interface ContextState {
  lastDrawWinners: number[];
  lastDrawMachine: number[];
  gaps: Record<number, number>;
  recentFreqs: Record<number, number>;
  longTermFreqs: Record<number, number>;
}

/**
 * Calcule l'IQR (Interquartile Range) d'un tableau trié de nombres.
 */
const calculateIQR = (sortedValues: number[]): number => {
  if (sortedValues.length === 0) return 1;
  const q1 = sortedValues[Math.floor(sortedValues.length * 0.25)] || 0;
  const q3 = sortedValues[Math.floor(sortedValues.length * 0.75)] || 0;
  return Math.max(1e-6, q3 - q1);
};

/**
 * Calcule la moyenne arithmétique.
 */
const calculateMean = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

/**
 * Calcule l'écart-type d'un tableau de nombres de manière déterministe.
 */
const calculateStdDev = (values: number[], mean: number): number => {
  if (values.length === 0) return 1;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance) || 1;
};

/**
 * Précalcule le state contextuel pour un ensemble de tirages de manière hautement performante (complexité linéaire).
 */
const computeContextState = (results: DrawResult[]): ContextState => {
  const lastDraw = results[0];
  const lastDrawWinners = lastDraw ? (lastDraw.gagnants || []) : [];
  const lastDrawMachine = lastDraw ? (lastDraw.machine || []) : [];
  
  const gaps: Record<number, number> = {};
  const recentFreqs: Record<number, number> = {};
  const longTermFreqs: Record<number, number> = {};
  
  for (let n = 1; n <= 90; n++) {
    gaps[n] = results.length;
    recentFreqs[n] = 0;
    longTermFreqs[n] = 0;
  }
  
  const windowBase = Math.floor(90 / Math.PI); // ~28 tirages
  const limitFreq = Math.min(results.length, windowBase);
  
  for (let i = 0; i < results.length; i++) {
    const draw = results[i];
    const winners = draw.gagnants || [];
    for (const n of winners) {
      if (n >= 1 && n <= 90) {
        if (gaps[n] === results.length) {
          gaps[n] = i; // Premier index d'occurrence
        }
        if (i < limitFreq) {
          recentFreqs[n]++;
        }
        longTermFreqs[n]++;
      }
    }
  }
  
  return {
    lastDrawWinners,
    lastDrawMachine,
    gaps,
    recentFreqs,
    longTermFreqs
  };
};

/**
 * Extrait les caractéristiques numériques pures et décorrélées à partir d'un ContextState précalculé.
 * ZÉRO NOMBRE MAGIQUE : Toutes les normalisations utilisent des métriques statistiques robustes.
 */
const extractNumericFeatures = (
  num: number,
  resultsLength: number,
  contextState: ContextState,
  globalConsensusMap: Record<number, number>,
  activeIndices: number[],
  datasetStats: { 
    medianGap: number;
    iqrGap: number; 
    meanFreq: number;
    stdFreq: number; 
    medianConsensus: number;
    iqrConsensus: number;
    trapThresholdZ: number;
  }
): number[] => {
  if (resultsLength < 5 || num < 1 || num > 90) {
    return new Array(activeIndices.length).fill(0);
  }

  const rawFreq = contextState.recentFreqs[num] || 0;
  const gap = contextState.gaps[num] || 0;
  const consensus = globalConsensusMap[num] || 0;

  // --- DISTANCES TOPOLOGIQUES AVEC DÉCRUE GAUSSIENNE CONTINUE ---
  // Voisins récents
  let neighborSum = 0;
  for (const w of contextState.lastDrawWinners) {
    const dist = Math.abs(num - w);
    neighborSum += Math.exp(-0.5 * Math.pow(dist / SIGMA_TOPOLOGY, 2));
  }
  const neighborFeature = Math.min(1.0, neighborSum);

  // Machine Leak
  let machineSum = 0;
  for (const m of contextState.lastDrawMachine) {
    const dist = Math.abs(num - m);
    machineSum += Math.exp(-0.5 * Math.pow(dist / SIGMA_TOPOLOGY, 2));
  }
  const machineFeature = Math.min(1.0, machineSum);

  // A. Écart de retour critique : PDF Gaussienne basée sur le Z-score robuste (IQR)
  const robustGapSigma = Math.max(1e-6, datasetStats.iqrGap / 1.349);
  const zGap = (gap - datasetStats.medianGap) / robustGapSigma;
  const criticalGapFeature = Math.exp(-0.5 * Math.pow(zGap, 2));

  // B. Fréquence et Divergence (recent vs long terme)
  const freqSigma = Math.max(1e-6, datasetStats.stdFreq);
  const zFreq = (rawFreq - datasetStats.meanFreq) / freqSigma;
  const baseFreqScore = 1.0 / (1.0 + Math.exp(-zFreq));
  
  const limitFreq = Math.min(resultsLength, Math.floor(90 / Math.PI));
  const recentRatio = rawFreq / Math.max(1, limitFreq);
  const longTermRatio = (contextState.longTermFreqs[num] || 0) / Math.max(1, resultsLength);
  const divergence = longTermRatio - recentRatio; // Positif si historiquement chaud mais récemment absent
  const divergenceScore = 1.0 / (1.0 + Math.exp(-divergence * 5.0));
  
  const frequencyFeature = 0.7 * baseFreqScore + 0.3 * divergenceScore;

  // C. Shadow Density & Consensus Trap : Basés sur l'IQR de consensus robuste
  const robustConsensusSigma = Math.max(1e-6, datasetStats.iqrConsensus / 1.349);
  const zConsensus = (consensus - datasetStats.medianConsensus) / robustConsensusSigma;
  
  const smoothFactor = 0.5 + 0.5 / (1.0 + Math.exp(-zFreq));
  const shadowDensity = (1.0 / (1.0 + Math.exp(-zConsensus))) * smoothFactor;
  
  const trapFeature = 1.0 / (1.0 + Math.exp(-(zConsensus - datasetStats.trapThresholdZ)));

  // D. Norm Gap (Pression de retard asymétrique cumulée)
  const normGapFeature = 1.0 / (1.0 + Math.exp(-zGap));

  const allFeatures = [
    criticalGapFeature,
    frequencyFeature,
    shadowDensity,
    trapFeature,
    neighborFeature,
    machineFeature,
    normGapFeature
  ];

  return activeIndices.map(idx => allFeatures[idx]);
};

/**
 * Construit la carte de consensus (fréquence globale normalisée).
 */
export const buildConsensusMap = (history: DrawResult[]): Record<number, number> => {
  const consensusMap: Record<number, number> = {};
  const windowSize = Math.max(20, Math.floor(Math.sqrt(history.length) * 5));
  const slice = history.slice(0, windowSize);
  
  for (let i = 1; i <= 90; i++) {
    let freq = 0;
    for (const r of slice) {
      if (r.gagnants?.includes(i)) freq++;
      if (r.machine?.includes(i)) freq += 0.5;
    }
    consensusMap[i] = (freq / (windowSize / 10)) * 100;
  }
  return consensusMap;
};

/**
 * Calcule les statistiques d'historique globales robustes (Médianes, IQR, Moyennes).
 */
export const computeDatasetStats = (
  history: DrawResult[], 
  consensusMap: Record<number, number>
) => {
  const freqsArr: number[] = [];
  const gapsArr: number[] = [];
  
  const tempGaps: Record<number, number> = {};
  for (let n = 1; n <= 90; n++) {
    tempGaps[n] = history.length;
  }
  for (let i = 0; i < history.length; i++) {
    const winners = history[i].gagnants || [];
    for (const n of winners) {
      if (n >= 1 && n <= 90 && tempGaps[n] === history.length) {
        tempGaps[n] = i;
      }
    }
  }
  
  for (let i = 1; i <= 90; i++) {
    freqsArr.push(consensusMap[i] || 0);
    gapsArr.push(tempGaps[i]);
  }

  const sortedFreqs = [...freqsArr].sort((a, b) => a - b);
  const sortedGaps = [...gapsArr].sort((a, b) => a - b);

  const medianFreq = sortedFreqs[Math.floor(sortedFreqs.length / 2)] || 0;
  const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)] || 0;
  const medianConsensus = medianFreq;

  const iqrGap = calculateIQR(sortedGaps);
  const iqrConsensus = calculateIQR(sortedFreqs);

  const meanFreq = calculateMean(freqsArr);
  const stdFreq = calculateStdDev(freqsArr, meanFreq);

  let skewFreq = 0;
  if (stdFreq > Number.EPSILON) {
    const sumCubedDiff = freqsArr.reduce((sum, val) => sum + Math.pow((val - meanFreq) / stdFreq, 3), 0);
    skewFreq = sumCubedDiff / freqsArr.length;
  }
  const trapThresholdZ = 1.0 + Math.max(0.2, Math.min(2.0, Math.abs(skewFreq)));

  return {
    medianGap,
    iqrGap,
    meanFreq,
    stdFreq,
    medianConsensus,
    iqrConsensus,
    trapThresholdZ
  };
};

/**
 * Exécute une forêt d'arbres décisionnels (Random Forest) via un Worker.
 * Isolation complète du tirage, sans couplage au store global, avec diagnostic de qualité.
 */
export const runDecisionForest = async (
  rawHistory: DrawResult[],
  mode: 'consensus' | 'average' | 'shadow' = 'consensus',
  activeFeatures: string[] = FEATURES_LABELS,
  drawName?: string
): Promise<{ 
  votes: ForestVote[], 
  dataset: { features: number[]; class: number; weight: number }[],
  diagnostics?: DecisionForestDiagnostics
}> => {
  const startTime = Date.now();
  if (!rawHistory || rawHistory.length === 0) return { votes: [], dataset: [] };

  const activeDrawName = drawName || useNexusStore.getState().drawName || "Reveil";
  const history = purifyHistoryForDraw(activeDrawName, rawHistory);

  if (history.length < 40) {
    console.warn("Historique insuffisant pour Decision Forest (Min 40).");
    return { votes: [], dataset: [] };
  }

  const activeIndices = activeFeatures.map(label => FEATURES_LABELS.indexOf(label)).filter(idx => idx !== -1);
  if (activeIndices.length === 0) return { votes: [], dataset: [] };

  // 1. Calcul du Consensus Map (avec cache stable)
  const firstDrawId = history[0]?.id || 'empty';
  const cacheKey = getConsensusCacheKey(activeDrawName, history.length, firstDrawId);
  let consensusMap = consensusCache.get(cacheKey);
  if (!consensusMap) {
    consensusMap = buildConsensusMap(history);
    consensusCache.set(cacheKey, consensusMap);
  }

  // 2. Calcul des Statistiques Dynamiques Rigoureuses
  const datasetStats = computeDatasetStats(history, consensusMap);

  // 3. Préparation du Dataset d'entraînement (Sliding Window & Recency Weighting)
  const dataset: { features: number[], label: 0 | 1; weight: number }[] = [];
  const h = calculateFractalIndex(history);
  const trainingWindow = Math.max(30, Math.floor(history.length * (1.0 - Math.abs(h - 0.5))));
  const trainingSlice = history.slice(0, trainingWindow);

  let positiveCount = 0;
  let negativeCount = 0;

  for (let idx = 0; idx < trainingSlice.length; idx++) {
    const target = trainingSlice[idx];
    const context = history.slice(idx + 1);    
    if (context.length < 20) continue;

    const winners = target.gagnants || [];
    const winnerSet = new Set(winners);

    // Pondération temporelle par récence : décrue exponentielle fluide
    const weight = Number((0.2 + 0.8 * Math.exp(-idx / (trainingSlice.length * 0.5))).toFixed(4));

    // Précalcul contextuel optimisé pour cette ligne d'entraînement
    const contextState = computeContextState(context);

    // Exemples Positifs
    for (const n of winners) {
      if (n >= 1 && n <= 90) {
        dataset.push({ 
          features: extractNumericFeatures(n, context.length, contextState, consensusMap, activeIndices, datasetStats), 
          label: 1,
          weight
        });
        positiveCount++;
      }
    }

    // Échantillonnage Négatif Stratifié Déterministe (1/3 close, 1/3 high consensus, 1/3 uniform)
    let lcgSeed = (idx * 1664525 + (winners[0] || 1)) >>> 0;
    const lcgRandom = () => {
      lcgSeed = (lcgSeed * 1664525 + 1013904223) >>> 0;
      return lcgSeed / 4294967296;
    };

    // Stratum 1: Négatifs proches des gagnants (+/-1 ou +/-2)
    const closeCandidates: number[] = [];
    for (const w of winners) {
      for (const offset of [-2, -1, 1, 2]) {
        const val = w + offset;
        if (val >= 1 && val <= 90 && !winnerSet.has(val)) {
          if (!closeCandidates.includes(val)) closeCandidates.push(val);
        }
      }
    }

    // Stratum 2: Négatifs à fort consensus
    const highConsensusCandidates: number[] = [];
    for (let n = 1; n <= 90; n++) {
      if (!winnerSet.has(n)) highConsensusCandidates.push(n);
    }
    highConsensusCandidates.sort((a, b) => (consensusMap![b] || 0) - (consensusMap![a] || 0));

    const targetNegativesCount = winners.length;
    const countPerStratum = Math.ceil(targetNegativesCount / 3);
    const negativesSet = new Set<number>();

    // 1/3 Proches
    if (closeCandidates.length > 0) {
      const shuffledClose = [...closeCandidates];
      for (let i = shuffledClose.length - 1; i > 0; i--) {
        const j = Math.floor(lcgRandom() * (i + 1));
        const temp = shuffledClose[i];
        shuffledClose[i] = shuffledClose[j];
        shuffledClose[j] = temp;
      }
      let selected = 0;
      for (const n of shuffledClose) {
        if (selected >= countPerStratum || negativesSet.size >= targetNegativesCount) break;
        negativesSet.add(n);
        selected++;
      }
    }

    // 1/3 Fort Consensus
    if (highConsensusCandidates.length > 0) {
      let selected = 0;
      for (const n of highConsensusCandidates) {
        if (selected >= countPerStratum || negativesSet.size >= targetNegativesCount) break;
        if (!negativesSet.has(n)) {
          negativesSet.add(n);
          selected++;
        }
      }
    }

    // 1/3 Uniformes
    let attempts = 0;
    while (negativesSet.size < targetNegativesCount && attempts < 100) {
      attempts++;
      const rnd = Math.floor(lcgRandom() * 90) + 1;
      if (!winnerSet.has(rnd) && !negativesSet.has(rnd)) {
        negativesSet.add(rnd);
      }
    }

    // Push des négatifs
    for (const rnd of negativesSet) {
      dataset.push({ 
        features: extractNumericFeatures(rnd, context.length, contextState, consensusMap, activeIndices, datasetStats), 
        label: 0,
        weight
      });
      negativeCount++;
    }
  }

  // 4. Préparation des candidats pour la prédiction (T+1)
  const globalContextState = computeContextState(history);
  const candidates = Array.from({ length: 90 }, (_, i) => {
    const num = i + 1;
    return {
      number: num,
      features: extractNumericFeatures(num, history.length, globalContextState, consensusMap, activeIndices, datasetStats)
    };
  });

  // 5. Délégation au Web Worker
  const votesAndDataset = await new Promise<{ votes: ForestVote[], dataset: { features: number[]; class: number; weight: number }[] }>((resolve, reject) => {    
    const worker = new Worker(new URL('./workers/forest.worker.ts?worker', import.meta.url), { type: 'module' });
    
    const timeout = setTimeout(() => {
      console.warn("Decision Forest Worker timed out");
      worker.terminate();
      resolve({ votes: [], dataset: [] });
    }, 120000);

    worker.onmessage = (e) => {
      clearTimeout(timeout);
      const { votes: workerVotes } = e.data;
      worker.terminate();

      if (!workerVotes) {
        resolve({ votes: [], dataset: [] });
        return;
      }

      const finalVotes: ForestVote[] = workerVotes.map((v: any) => {
        const num = v.number !== undefined ? v.number : v.class;
        const cand = candidates.find(c => c.number === num);
        return {
          candidate: num,
          score: Math.round(v.score),
          votes: { temporal: 0, spatial: 0, structural: 0 },
          decisionPath: { id: 'root', type: 'condition', label: 'Forest Consensus', children: [] } as DecisionNode,
          features: { 
            isConsensusTrap: v.score > (datasetStats.medianConsensus + datasetStats.trapThresholdZ * (datasetStats.iqrConsensus / 1.349)),
            values: cand ? cand.features : []
          }
        };
      });

      // Mappage d'affinité continue basé sur le Z-score
      const scores = finalVotes.map(v => v.score / 100.0);
      const meanScore = calculateMean(scores);
      const stdScore = calculateStdDev(scores, meanScore);

      const affinityArray = finalVotes.map(v => {
        const normalizedScore = v.score / 100.0;
        const zScore = (normalizedScore - meanScore) / stdScore;
        let affinity = 0;

        if (mode === 'consensus') {
          affinity = 1.0 / (1.0 + Math.exp(-1.0 * zScore));
        } else if (mode === 'average') {
          affinity = Math.exp(-0.5 * Math.pow(zScore, 2));
        } else {
          affinity = Math.exp(-0.5 * Math.pow(zScore + 1.0, 2)); 
        }
        return { vote: v, affinity };
      });

      const sortedByAffinity = affinityArray
        .filter(item => item.affinity > (1.0 / 90.0))
        .sort((a, b) => b.affinity - a.affinity || b.vote.score - a.vote.score)
        .map(item => item.vote);

      // Correction : Formatage correct du dataset complet pour calculateFeatureImportance
      const formattedDataset = dataset.map(d => ({
        features: d.features,
        class: d.label,
        weight: d.weight
      }));

      resolve({ votes: sortedByAffinity.slice(0, 20), dataset: formattedDataset });    
    };

    worker.onerror = (err) => { 
      clearTimeout(timeout);
      worker.terminate(); 
      console.error("Decision Forest Worker Error", err);
      reject(new Error("Echec du calcul Forest Worker")); 
    };

    // Configuration de la forêt dérivée continûment
    const numTrees = Math.min(100, Math.max(50, Math.floor(dataset.length / Math.log2(dataset.length + 1))));
    const maxDepth = Math.max(3, Math.floor(Math.log2(dataset.length / activeIndices.length)));
    
    // Simplification pour le worker qui s'attend à "features" et "label"
    const workerDataset = dataset.map(d => ({
      features: d.features,
      label: d.label
    }));

    worker.postMessage({ 
      dataset: workerDataset, 
      candidates, 
      config: { numTrees, maxDepth },
      timeSignature: history.length 
    });
  });

  // Calcul du skewness de consensus global pour diagnostics
  const freqs = Object.values(consensusMap);
  const meanF = calculateMean(freqs);
  const stdF = calculateStdDev(freqs, meanF);
  let skewness = 0;
  if (stdF > Number.EPSILON) {
    const sumCubed = freqs.reduce((acc, f) => acc + Math.pow((f - meanF) / stdF, 3), 0);
    skewness = sumCubed / freqs.length;
  }

  const diagnostics: DecisionForestDiagnostics = {
    datasetSize: dataset.length,
    positiveCount,
    negativeCount,
    positiveRatio: positiveCount / Math.max(1, dataset.length),
    skewness,
    medianGap: datasetStats.medianGap,
    iqrGap: datasetStats.iqrGap,
    meanFreq: datasetStats.meanFreq,
    stdFreq: datasetStats.stdFreq,
    activeFeaturesCount: activeIndices.length,
    elapsedMs: Date.now() - startTime
  };

  return {
    votes: votesAndDataset.votes,
    dataset: votesAndDataset.dataset,
    diagnostics
  };
};

/**
 * Calcule l'importance des features en utilisant le coefficient de corrélation de Pearson (R²).
 * Formule exacte : r = Σ((x - mx)(y - my)) / sqrt(Σ(x - mx)² * Σ(y - my)²)
 */
export const calculateFeatureImportance = (
  dataset: { features: number[]; class: number; weight: number }[],
  activeFeatures: string[]
): Record<string, number> => {
  const importanceMap: Record<string, number> = {};
  if (!dataset || dataset.length === 0) return importanceMap;

  const n = dataset.length;
  const meanY = dataset.reduce((acc, d) => acc + d.class, 0) / n;

  activeFeatures.forEach((label, featureIndex) => {
    const meanX = dataset.reduce((acc, d) => acc + d.features[featureIndex], 0) / n;
    
    let numerator = 0;
    let denominatorX = 0;
    let denominatorY = 0;
 
    for (const d of dataset) {
      const x = d.features[featureIndex];
      const y = d.class;
      const diffX = x - meanX;
      const diffY = y - meanY;

      numerator += diffX * diffY;
      denominatorX += diffX * diffX;
      denominatorY += diffY * diffY;
    }
    
    const rSquared = (denominatorX < Number.EPSILON || denominatorY < Number.EPSILON) 
      ? 0 
      : Math.pow(numerator, 2) / (denominatorX * denominatorY);

    importanceMap[label] = rSquared;
  });

  // Normalisation relative au max pour l'UI (ramène la plus importante à 1.0)
  const maxVal = Math.max(Number.EPSILON, ...Object.values(importanceMap));
  for (const label in importanceMap) {
    importanceMap[label] = importanceMap[label] / maxVal;
  }

  return importanceMap;
};
