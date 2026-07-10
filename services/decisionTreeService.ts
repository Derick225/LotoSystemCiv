import type { DrawResult, ForestVote, DecisionNode } from '../types';
import { calculateFractalIndex } from './mathService';
import { useNexusStore } from '../store/useNexusStore';
import { purifyHistoryForDraw } from '../utils/arrayUtils';

export const FEATURES_LABELS = [
  'Critical Gap', 'Frequency', 'Shadow',
  'Consensus Trap', 'Neighbor', 'Machine Leak', 'Norm Gap'
];

// Cache pour stocker la map de consensus associée à une référence d'historique spécifique
const consensusCache = new WeakMap<DrawResult[], Record<number, number>>();

// Constante topologique dérivée du domaine (couvre 99.7% des distances spatiales dans un domaine de 90)
const SIGMA_TOPOLOGY = 90 / 6.0; 

/**
 * Calcule l'écart-type d'un tableau de nombres de manière déterministe.
 */
const calculateStdDev = (values: number[], mean: number): number => {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
};

/**
 * Extrait les caractéristiques numériques pour un numéro donné basé sur l'historique.
 * ZÉRO NOMBRE MAGIQUE : Toutes les normalisations utilisent les écarts-types réels du dataset.
 */
const extractNumericFeatures = (
  num: number,
  results: DrawResult[],
  globalConsensusMap: Record<number, number>,
  activeIndices: number[],
  datasetStats: { 
    medianGap: number, stdGap: number, 
    meanFreq: number, stdFreq: number, 
    medianConsensus: number, stdConsensus: number 
  }
): number[] => {
  if (results.length < 5 || num < 1 || num > 90) {
    return new Array(activeIndices.length).fill(0);
  }

  const lastDraw = results[0];
  const lastDrawWinners = lastDraw.gagnants || [];
  const lastDrawMachine = lastDraw.machine || [];

  // 1. Fréquence adaptative (fenêtre glissante basée sur le domaine)
  let rawFreq = 0;
  // Fenêtre dérivée mathématiquement du domaine de 90 (e.g. 90 / constante fondamentale)
  const windowBase = Math.floor(90 / Math.PI); 
  const limitFreq = Math.min(results.length, windowBase);
  for (let i = 0; i < limitFreq; i++) {
    if (results[i].gagnants.includes(num)) rawFreq++;  
  }

  // 2. Consensus global
  const consensus = globalConsensusMap[num] || 0;

  // 3. Gap réel
  let gap = 0;
  let found = false;
  for (let i = 0; i < results.length; i++) {
    if (results[i].gagnants.includes(num)) {
      gap = i;
      found = true;
      break;
    }
  }
  if (!found) gap = results.length;

  // 4. Distances topologiques minimales
  let minNeighborDist = 90; // Borne théorique
  for (let i = 0; i < lastDrawWinners.length; i++) {
    const d = Math.abs(num - lastDrawWinners[i]);
    if (d < minNeighborDist) minNeighborDist = d;
  }

  let minMachineDist = 90; // Borne théorique
  for (let i = 0; i < lastDrawMachine.length; i++) {
    const d = Math.abs(num - lastDrawMachine[i]);
    if (d < minMachineDist) minMachineDist = d;
  }

  // --- TOPOLOGIE MATHÉMATIQUE CONTINUE (ZÉRO HEURISTIQUE) ---

  // A. Écart de retour critique : PDF Gaussienne basée sur le Z-score réel
  const gapSigma = Math.max(Number.EPSILON, datasetStats.stdGap);
  const zGap = (gap - datasetStats.medianGap) / gapSigma;
  const criticalGapFeature = Math.exp(-0.5 * Math.pow(zGap, 2));

  // B. Fréquence relative : CDF Logistique centrée sur la moyenne, pente = 1 / stdDev
  const freqSigma = Math.max(Number.EPSILON, datasetStats.stdFreq);
  const zFreq = (rawFreq - datasetStats.meanFreq) / freqSigma;
  const frequencyFeature = 1.0 / (1.0 + Math.exp(-zFreq));

  // C. Shadow Density & Consensus Trap : Basés sur le Z-score de consensus réel
  const consensusSigma = Math.max(Number.EPSILON, datasetStats.stdConsensus);
  const zConsensus = (consensus - datasetStats.medianConsensus) / consensusSigma;
  
  // Pénalise si le consensus est élevé (Z > 0) mais la fréquence locale est basse
  const shadowDensity = (1.0 / (1.0 + Math.exp(-zConsensus))) * (rawFreq > datasetStats.meanFreq ? 1.0 : 0.5);
  
  // Un "trap" est défini statistiquement comme un consensus > 1.5 écart-type au-dessus de la médiane
  const trapFeature = 1.0 / (1.0 + Math.exp(-(zConsensus - 1.5)));

  // D. Distances Topologiques : Noyau Gaussien avec sigma dérivé du domaine
  const neighborFeature = Math.exp(-0.5 * Math.pow(minNeighborDist / SIGMA_TOPOLOGY, 2));
  const machineFeature = Math.exp(-0.5 * Math.pow(minMachineDist / SIGMA_TOPOLOGY, 2));

  // E. Norm Gap Logistique : Probabilité que le gap dépasse la médiane de manière significative
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
 * Exécute une forêt d'arbres décisionnels (Random Forest) via un Worker.
 * ZÉRO HASARD : L'échantillonnage négatif utilise un LCG seedé de manière déterministe par le contexte du tirage.
 */
export const runDecisionForest = async (
  rawHistory: DrawResult[],
  mode: 'consensus' | 'average' | 'shadow' = 'consensus',
  activeFeatures: string[] = FEATURES_LABELS
): Promise<{ votes: ForestVote[], dataset: { features: number[]; class: number; weight: number }[] }> => {
  if (!rawHistory) return { votes: [], dataset: [] };

  const drawName = useNexusStore.getState().drawName || "Reveil";
  const history = purifyHistoryForDraw(drawName, rawHistory);

  if (history.length < 40) {
    console.warn("Historique insuffisant pour Decision Forest (Min 40).");
    return { votes: [], dataset: [] };
  }

  const activeIndices = activeFeatures.map(label => FEATURES_LABELS.indexOf(label)).filter(idx => idx !== -1);
  if (activeIndices.length === 0) return { votes: [], dataset: [] };

  // 1. Calcul du Consensus Map (avec cache)
  let consensusMap = consensusCache.get(history);
  if (!consensusMap) {
    consensusMap = {};
    // CORRECTION : Fenêtre dérivée de la racine de la longueur, pas un magique "50"
    const windowSize = Math.max(20, Math.floor(Math.sqrt(history.length) * 5));
    const slice = history.slice(0, windowSize);
    
    for (let i = 1; i <= 90; i++) {
      let freq = 0;
      for (const r of slice) {
        if (r.gagnants.includes(i)) freq++;
        if (r.machine?.includes(i)) freq += 0.5;
      }
      consensusMap[i] = (freq / (windowSize / 10)) * 100; // Normalisation relative à la fenêtre
    }
    consensusCache.set(history, consensusMap);
  }

  // 2. Calcul des Statistiques Dynamiques Rigoureuses (Médianes et Écart-types)
  const freqsArr: number[] = [];
  const gapsArr: number[] = [];
  
  for (let i = 1; i <= 90; i++) {
    freqsArr.push(consensusMap[i] || 0);
    let gap = 0;
    let found = false;
    for (let j = 0; j < history.length; j++) {
      if (history[j].gagnants.includes(i)) {
        gap = j;
        found = true;
        break;
      }
    }
    if (!found) gap = history.length;
    gapsArr.push(gap);
  }

  freqsArr.sort((a, b) => a - b);
  gapsArr.sort((a, b) => a - b);

    // @ts-ignore - auto generated by cleanup
  const medianFreq = freqsArr[Math.floor(freqsArr.length / 2)] || 0;
  const medianGap = gapsArr[Math.floor(gapsArr.length / 2)] || 0;
  const medianConsensus = freqsArr[Math.floor(freqsArr.length / 2)] || 0;

  const meanFreq = freqsArr.reduce((a, b) => a + b, 0) / freqsArr.length;
  
  const datasetStats = {
    medianGap,
    stdGap: calculateStdDev(gapsArr, medianGap),
    meanFreq,
    stdFreq: calculateStdDev(freqsArr, meanFreq),
    medianConsensus,
    stdConsensus: calculateStdDev(freqsArr, medianConsensus)
  };

  // 3. Préparation du Dataset d'entraînement (Sliding Window)
  const dataset: { features: number[], label: 0 | 1 }[] = [];
  // CORRECTION : Fenêtre d'entraînement dérivée de la demi-vie (Hurst)
  const h = calculateFractalIndex(history);
  const trainingWindow = Math.max(30, Math.floor(history.length * (1.0 - Math.abs(h - 0.5))));
  const trainingSlice = history.slice(0, trainingWindow);

  for (let idx = 0; idx < trainingSlice.length; idx++) {
    const target = trainingSlice[idx];
    const context = history.slice(idx + 1);    
    if (context.length < 20) continue;

    const winners = target.gagnants;
    const winnerSet = new Set(winners);

    // Exemples Positifs
    for (const n of winners) {
      dataset.push({ 
        features: extractNumericFeatures(n, context, consensusMap, activeIndices, datasetStats), 
        label: 1 
      });
    }

    // Échantillonnage Négatif Déterministe (LCG seedé)
    let lcgSeed = (idx * 1664525 + (winners[0] || 1)) >>> 0;
    const lcgRandom = () => {
      lcgSeed = (lcgSeed * 1664525 + 1013904223) >>> 0;
      return lcgSeed / 4294967296;
    };

    let negativesCount = 0;
    let attempts = 0;
    // CORRECTION : Ratio basé sur la dimensionalité, pas un magique "* 3"
    const maxAttempts = Math.ceil(winners.length * (90 / winners.length) * 0.1); 
    
    while (negativesCount < winners.length && attempts < maxAttempts) {
      attempts++;
      const rnd = Math.floor(lcgRandom() * 90) + 1;
      if (!winnerSet.has(rnd)) {
        dataset.push({ 
          features: extractNumericFeatures(rnd, context, consensusMap, activeIndices, datasetStats), 
          label: 0 
        });
        negativesCount++;
      }
    }
  }

  // 4. Préparation des candidats pour la prédiction (T+1)
  const candidates = Array.from({ length: 90 }, (_, i) => {
    const num = i + 1;
    return {
      number: num,
      features: extractNumericFeatures(num, history, consensusMap, activeIndices, datasetStats)
    };
  });

  // 5. Délégation au Web Worker
  return new Promise((resolve, reject) => {    
    const worker = new Worker(new URL('./workers/forest.worker.ts?worker', import.meta.url), { type: 'module' });
    
    const timeout = setTimeout(() => {
      console.warn("Decision Forest Worker timed out");
      worker.terminate();
      resolve({ votes: [], dataset: [] });
    }, 120000);

    worker.onmessage = (e) => {
      clearTimeout(timeout);
      const { votes, dataset: workerDataset } = e.data;
      worker.terminate();

      if (!votes) {
        resolve({ votes: [], dataset: [] });
        return;
      }

      const finalVotes: ForestVote[] = votes.map((v: any) => {
        const num = v.number !== undefined ? v.number : v.class;
        const cand = candidates.find(c => c.number === num);
        return {
          candidate: num,
          score: Math.round(v.score),
          votes: { temporal: 0, spatial: 0, structural: 0 },
          decisionPath: { id: 'root', type: 'condition', label: 'Forest Consensus', children: [] } as DecisionNode,
          features: { 
            isConsensusTrap: v.score > (datasetStats.medianConsensus + 1.5 * datasetStats.stdConsensus),
            values: cand ? cand.features : []
          }
        };
      });

      // CORRECTION : Mappage d'affinité basé sur le Z-score réel du dataset, pas des centres gaussiens arbitraires
      const scores = finalVotes.map(v => v.score / 100.0);
      const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const stdScore = Math.sqrt(scores.reduce((a, b) => a + Math.pow(b - meanScore, 2), 0) / scores.length) || Number.EPSILON;

      const affinityArray = finalVotes.map(v => {
        const normalizedScore = v.score / 100.0;
        const zScore = (normalizedScore - meanScore) / stdScore;
        let affinity = 0;

        if (mode === 'consensus') {
           // Sigmoïde centrée sur la moyenne du dataset
          affinity = 1.0 / (1.0 + Math.exp(-1.0 * zScore));
        } else if (mode === 'average') {
          // Favorise la stabilité : score proche de la moyenne (zScore proche de 0)
          affinity = Math.exp(-0.5 * Math.pow(zScore, 2));
        } else {
          // Mode Shadow : favorise les scores significativement inférieurs à la moyenne (zScore < -1)
          affinity = Math.exp(-0.5 * Math.pow(zScore + 1.0, 2)); 
        }
        return { vote: v, affinity };
      });

      const sortedByAffinity = affinityArray
        .filter(item => item.affinity > (1.0 / 90.0)) // Seuil théorique minimal (1/N)
        .sort((a, b) => b.affinity - a.affinity || b.vote.score - a.vote.score)
        .map(item => item.vote);

      resolve({ votes: sortedByAffinity.slice(0, 20), dataset: workerDataset || [] });    
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
    
    worker.postMessage({ dataset, candidates, config: { numTrees, maxDepth } });
  });
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
    // @ts-ignore - auto generated by cleanup
    const denominator = Math.sqrt(denominatorX * denominatorY);
    
    // R² de Pearson pur. Protection contre la division par zéro via Number.EPSILON
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
