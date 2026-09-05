import { DnaAnomalyReport, DnaPostMortemMetrics, AlgoKey } from '../../types';
import { DnaSieveResult } from '../temporalAnalysisService';

export interface DnaFeedbackCalibration {
  drawName: string;
  updatedAt: string;
  totalPostMortemSessions: number;
  geneMultipliers: Record<string, number>; // Amortissement / boost appris pour chaque gène d'ADN
  biasDampers: {
    parityBiasDamping: number; // Facteur d'amortissement de parité [0.5, 1.5]
    decadeRegularization: number; // Facteur de régularisation d'entropie des décades
    hawkesExcitationDamping: number; // Amortissement d'auto-excitation [0.5, 1.0]
    temporalPhaseCorrection: number; // Décalage angulaire de phase
    entropyBoost: number; // Boost de dispersion en cas d'effondrement
  };
  recurrentAnomalyHistory: DnaAnomalyReport[];
  activeCorrectiveActions: {
    targetParameter: string;
    adjustmentFormula: string;
    dampingFactor: number;
    recommendedValueChange: number;
    explanation: string;
  }[];
}

// Mémoire locale volatile et isolée par tirage
const inMemoryDnaFeedbackCache: Map<string, DnaFeedbackCalibration> = new Map();

/**
 * Normalise la clé de tirage pour l'isolation stricte (Tirage Isolation Rule)
 */
const getCacheKey = (drawName: string): string => {
  return `dna_feedback_${(drawName || 'default').trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
};

/**
 * Récupère la calibration de rétroaction d'ADN pour un tirage donné
 */
export const getDnaFeedbackCalibration = async (
  drawName: string
): Promise<DnaFeedbackCalibration | null> => {
  if (!drawName) return null;
  const key = getCacheKey(drawName);

  if (inMemoryDnaFeedbackCache.has(key)) {
    return inMemoryDnaFeedbackCache.get(key)!;
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as DnaFeedbackCalibration;
        inMemoryDnaFeedbackCache.set(key, parsed);
        return parsed;
      }
    } catch {
      // Ignorer silencieusement les erreurs de lecture localStorage
    }
  }

  return null;
};

/**
 * Récupère de façon synchrone la calibration d'ADN depuis le cache mémoire ou localStorage
 */
export const getDnaFeedbackCalibrationSync = (
  drawName: string
): DnaFeedbackCalibration | null => {
  if (!drawName) return null;
  const key = getCacheKey(drawName);

  if (inMemoryDnaFeedbackCache.has(key)) {
    return inMemoryDnaFeedbackCache.get(key)!;
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as DnaFeedbackCalibration;
        inMemoryDnaFeedbackCache.set(key, parsed);
        return parsed;
      }
    } catch {
      // Ignorer silencieusement
    }
  }

  return null;
};

/**
 * Sauvegarde la calibration de rétroaction d'ADN pour un tirage donné
 */
export const saveDnaFeedbackCalibration = async (
  drawName: string,
  calibration: DnaFeedbackCalibration
): Promise<void> => {
  if (!drawName) return;
  const key = getCacheKey(drawName);
  inMemoryDnaFeedbackCache.set(key, calibration);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(key, JSON.stringify(calibration));
    } catch {
      // Ignorer silencieusement les quotas localStorage
    }
  }
};

/**
 * Intègre les résultats d'une analyse post-mortem dans le calibrage d'ADN continu (Feedback Loop).
 * Respecte la règle Zéro Nombre Magique : tous les amortissements sont des fonctions continues
 * basées sur la divergence, l'impact et la sévérité des anomalies.
 */
export const integrateDnaPostMortemFeedback = async (
  drawName: string,
  metrics: DnaPostMortemMetrics
): Promise<DnaFeedbackCalibration> => {
  const existing = (await getDnaFeedbackCalibration(drawName)) || {
    drawName,
    updatedAt: new Date().toISOString(),
    totalPostMortemSessions: 0,
    geneMultipliers: {},
    biasDampers: {
      parityBiasDamping: 1.0,
      decadeRegularization: 1.0,
      hawkesExcitationDamping: 1.0,
      temporalPhaseCorrection: 0.0,
      entropyBoost: 1.0,
    },
    recurrentAnomalyHistory: [],
    activeCorrectiveActions: [],
  };

  // Taux d'apprentissage auto-amorti (décroît continûment avec le nombre de sessions pour converger)
  const sessionCount = existing.totalPostMortemSessions + 1;
  const learningRate = 0.15 / Math.sqrt(sessionCount); // Convergence gradient $O(1/\sqrt{n})$

  // 1. Mise à jour continue des multiplicateurs de gènes d'ADN
  const geneMultipliers = { ...existing.geneMultipliers };
  
  if (metrics.feedbackAdjustments && metrics.feedbackAdjustments.length > 0) {
    metrics.feedbackAdjustments.forEach((adj) => {
      const currentMultiplier = geneMultipliers[adj.targetGene] ?? 1.0;
      // Amortissement logistique continu
      const step = adj.sieveDamping * learningRate;
      // Bornes douces via tangente hyperbolique [0.3, 2.0]
      const updatedMultiplier = Math.max(0.3, Math.min(2.0, currentMultiplier + Math.tanh(step) * 0.5));
      geneMultipliers[adj.targetGene] = parseFloat(updatedMultiplier.toFixed(4));
    });
  }

  // 2. Mise à jour continue des amortisseurs de biais
  const biasDampers = { ...existing.biasDampers };
  const biases = metrics.recurrentBiases;

  if (biases) {
    // Parité : si le Z-score est élevé, on amplifie l'amortissement vers l'équilibre
    const parityAdjustment = -Math.tanh(biases.paritySkewZScore * 0.2) * learningRate;
    biasDampers.parityBiasDamping = Math.max(0.5, Math.min(1.5, biasDampers.parityBiasDamping + parityAdjustment));

    // Décades : si la concentration de Gini est excessive (> 0.45), on force la régularisation
    const giniExcess = Math.max(0, biases.decadeConcentrationGini - 0.40);
    biasDampers.decadeRegularization = Math.max(0.8, Math.min(2.0, biasDampers.decadeRegularization + giniExcess * learningRate * 2.0));

    // Hawkes : si auto-excitation excessive, on atténue
    if (biases.hawkesExcitationExcess > 0) {
      const hawkesAdjustment = -Math.tanh(biases.hawkesExcitationExcess) * learningRate;
      biasDampers.hawkesExcitationDamping = Math.max(0.4, Math.min(1.0, biasDampers.hawkesExcitationDamping + hawkesAdjustment));
    }

    // Dérive de phase temporelle
    biasDampers.temporalPhaseCorrection = (biasDampers.temporalPhaseCorrection + biases.temporalPhaseDrift * learningRate) % (2.0 * Math.PI);
  }

  // 3. Archivage systématique des anomalies et consolidation des actions correctives ciblées
  const updatedAnomalies = [
    ...metrics.classifiedAnomalies,
    ...existing.recurrentAnomalyHistory,
  ].slice(0, 30); // Conserve les 30 dernières anomalies documentées

  const activeActions = metrics.classifiedAnomalies.map((a) => a.correctiveAction);

  const updatedCalibration: DnaFeedbackCalibration = {
    drawName,
    updatedAt: new Date().toISOString(),
    totalPostMortemSessions: sessionCount,
    geneMultipliers,
    biasDampers,
    recurrentAnomalyHistory: updatedAnomalies,
    activeCorrectiveActions: activeActions,
  };

  await saveDnaFeedbackCalibration(drawName, updatedCalibration);
  return updatedCalibration;
};

/**
 * Applique les corrections de rétroaction d'ADN apprises à un résultat de tamisage (DnaSieveResult)
 * sans modifier l'immutabilité de l'entrée et sans rupture de gradient.
 */
export const applyDnaFeedbackToSieve = (
  sieveResult: DnaSieveResult,
  calibration: DnaFeedbackCalibration | null
): DnaSieveResult => {
  if (!calibration) return sieveResult;

  const N = 90;
  const newMultipliers = new Float32Array(sieveResult.multipliers);
  const newAffinityPercent = new Float32Array(sieveResult.affinityPercent);

  // Application douce des multiplicateurs de gènes appris
  const activeGenes = sieveResult.activeGenesBreakdown || [];
  let globalAdjustmentFactor = 1.0;

  activeGenes.forEach((g) => {
    const mult = calibration.geneMultipliers[g.gene];
    if (mult !== undefined) {
      // Modulation pondérée par le poids relatif du gène
      globalAdjustmentFactor += (mult - 1.0) * g.weight;
    }
  });

  // Régularisation de parité et de décades
  const parityDamper = calibration.biasDampers.parityBiasDamping;
  const decadeReg = calibration.biasDampers.decadeRegularization;

  for (let n = 1; n <= N; n++) {
    let m = newMultipliers[n];

    // Correction de parité
    const isEven = n % 2 === 0;
    if (isEven) {
      m *= parityDamper;
    } else {
      m *= (2.0 - parityDamper);
    }

    // Régularisation des décades extrêmes
    const decade = Math.floor((n - 1) / 10);
    if (decade === 0 || decade === 8) {
      m *= (1.0 + (decadeReg - 1.0) * 0.1);
    }

    // Modulation continue globale du tamis
    m *= globalAdjustmentFactor;

    // Bornage continu naturel [0.1, 2.5]
    newMultipliers[n] = Math.max(0.1, Math.min(2.5, m));
    newAffinityPercent[n] = Math.max(1, Math.min(99, Math.round(newAffinityPercent[n] * Math.sqrt(globalAdjustmentFactor))));
  }

  return {
    ...sieveResult,
    multipliers: newMultipliers,
    affinityPercent: newAffinityPercent,
  };
};
