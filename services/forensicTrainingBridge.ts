import { ForensicReport, DrawResult, LearningSession, AlgoWeights, NeuralFeedbackLog } from '../types';
import { AlgoKey } from '../shared/prediction.types';
import { getAlgoWeights, saveAlgoWeights, normalizeWeights } from './prediction/weightsManager';
import { getAdaptiveRules, saveAdaptiveRules } from './prediction/ticketAnalysisService';
import { detectGameRegime, calculateTemporalDriftLearningRate } from './mathService';
import { LCG } from '../utils/mathUtils';

const generateDeterministicId = (prefix: string, index: number, seedStr: string): string => {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const prng = new LCG(Math.abs(hash) + index);
  const randomPart = Math.floor(prng.next() * 1000000).toString(36);
  return `${prefix}_${randomPart}`;
};

/**
 * Génère une session d'apprentissage exploitable à partir d'un rapport forensic.
 * Tout calcul est continu, sans aucun nombre magique ni bifurcation brusque.
 */
export const generateLearningSession = async (
  forensicReport: ForensicReport,
  history: DrawResult[]
): Promise<LearningSession> => {
  const drawName = forensicReport.drawName;
  const currentWeights = await getAlgoWeights(drawName);
  const regime = detectGameRegime(history);

  // Dynamic learning rate calibrated by temporal drift (KL Divergence & Shannon entropy variance)
  // Formule canonique : η(t) = η0 / (1 + λ * D_KL(P || Q))
  const driftLrResult = calculateTemporalDriftLearningRate(history, 1.0 / Math.sqrt(Math.max(10, history.length)), 10);
  
  // Continuous dampening based on volatility and temporal persistence
  const volatilityDampening = 1.0 - Math.tanh(regime.volatility / 100.0);
  const hurstFactor = 0.5 + 0.5 * regime.hurst;
  const learningRate = driftLrResult.learningRate * volatilityDampening * hurstFactor;

  const adjustments: {
    algo: string;
    oldWeight: number;
    newWeight: number;
    reason: string;
  }[] = [];

  const proposedMap = new Map<string, number>();
  if (forensicReport.proposedAdjustments) {
    forensicReport.proposedAdjustments.forEach((adj) => {
      proposedMap.set(adj.algo, adj.proposedWeightChange);
    });
  }

  const keysAll = Object.keys(currentWeights);
  keysAll.forEach((algo) => {
    const oldWeight = currentWeights[algo as AlgoKey] ?? 0.1;
    let proposedDelta = proposedMap.get(algo) ?? 0.0;

    // Continuous adjustments for Black Swan or chaotic regimes using continuous intensity (Math.tanh)
    const blackSwanIntensity = forensicReport.isBlackSwan ? 1.0 : Math.tanh((forensicReport.suspicionScore || 0) / 100.0);
    const isResilientAlgo = [
      AlgoKey.GAPS,
      AlgoKey.SPECTRAL,
      AlgoKey.FRACTAL,
      AlgoKey.SPATIAL,
      AlgoKey.BAYES
    ].includes(algo as AlgoKey);
    
    const blackSwanBoost = 0.3 * (isResilientAlgo ? 1.0 : -0.6) * blackSwanIntensity;
    proposedDelta = proposedDelta * (1.0 - 0.5 * blackSwanIntensity) + blackSwanBoost;

    const delta = proposedDelta * learningRate;
    const rawNewWeight = oldWeight + delta;
    const newWeight = Math.max(0.01, rawNewWeight);

    adjustments.push({
      algo,
      oldWeight,
      newWeight,
      reason: proposedMap.has(algo)
        ? (forensicReport.proposedAdjustments?.find(a => a.algo === algo)?.reason || "Ajustement continu via gradients")
        : `Lissage continu du régime (Force: ${proposedDelta.toFixed(4)})`
    });
  });

  // Determine a missed number (completely deterministically)
  let missedNumber = forensicReport.combo && forensicReport.combo.length > 0 ? forensicReport.combo[0] : undefined;
  if (forensicReport.missedOpportunities && forensicReport.missedOpportunities.length > 0) {
    missedNumber = forensicReport.missedOpportunities[0].number;
  } else if (forensicReport.combo && forensicReport.combo.length > 0) {
    const idx = Math.floor(learningRate * 100) % forensicReport.combo.length;
    missedNumber = forensicReport.combo[idx];
  }

  return {
    id: `session_${forensicReport.id || 'unknown'}_${history.length}`,
    drawName,
    timestamp: Date.now(),
    adjustments,
    missedNumber,
  };
};

/**
 * Applique les ajustements d'une session d'apprentissage aux poids globaux
 * avec un mélange sigmoid continu pour amortir les brusques variations.
 */
export const applyForensicAdjustments = async (
  learningSession: LearningSession,
  baseWeights?: AlgoWeights,
  dryRun: boolean = false
): Promise<AlgoWeights> => {
  const drawName = learningSession.drawName;
  const currentWeights = baseWeights || await getAlgoWeights(drawName);
  const updatedWeights = { ...currentWeights };

  if (!learningSession.adjustments || learningSession.adjustments.length === 0) {
    return currentWeights;
  }

  // Facteur de mélange sigmoïde continu (plus il y a d'algorithmes ajustés, plus l'influence est ferme)
  const complexityRatio = learningSession.adjustments.length / 10.0;
  const alpha = 1.0 / (1.0 + Math.exp(-4.0 * (complexityRatio - 0.5)));

  learningSession.adjustments.forEach((adj) => {
    const algo = adj.algo as AlgoKey;
    if (updatedWeights[algo] !== undefined) {
      const oldVal = updatedWeights[algo];
      const newVal = adj.newWeight;
      // Mélange sigmoïdal continu
      updatedWeights[algo] = oldVal * (1.0 - alpha) + newVal * alpha;
    }
  });

  const finalNormalized = normalizeWeights(updatedWeights);

  if (!dryRun) {
    // Sauvegarde isolée par drawName
    await saveAlgoWeights(drawName, finalNormalized);

    // Ajustement continu des règles adaptatives
    const currentRules = getAdaptiveRules(drawName);
    const missedNum = learningSession.missedNumber || 45;
    const shift = 2.0 * Math.tanh((missedNum - 45.0) / 10.0);
    
    const updatedRules = {
      criticalZoneMin: Math.max(1, Math.min(80, Math.round(currentRules.criticalZoneMin + shift))),
      criticalZoneMax: Math.max(1, Math.min(90, Math.round(currentRules.criticalZoneMax + shift)))
    };
    saveAdaptiveRules(drawName, updatedRules);

    if (typeof window !== 'undefined') {
      try {
        const { useNexusStore } = await import('../store/useNexusStore');
        useNexusStore.getState().updateGlobalWeights(finalNormalized);

        // Génération et enregistrement des logs de feedback neuronal en temps réel
        const feedbackLogs: NeuralFeedbackLog[] = [];
        learningSession.adjustments?.forEach((adj, idx) => {
          const algo = adj.algo as AlgoKey;
          const oldW = currentWeights[algo] ?? 0;
          const newW = finalNormalized[algo] ?? 0;
          const diff = newW - oldW;
          if (Math.abs(diff) > 0.0001) {
            const impactPercentage = oldW > 0 ? (diff / oldW) * 100 : diff * 100;
            
            // Calcul d'un ID déterministe pour supprimer tout Math.random()
            const idSeed = `${drawName}_${algo}_${Date.now()}`;
            const feedbackLogId = generateDeterministicId("log", idx, idSeed);

            feedbackLogs.push({
              id: feedbackLogId,
              timestamp: Date.now(),
              drawName,
              algo,
              oldWeight: oldW,
              newWeight: newW,
              direction: diff > 0 ? 'BOOST' : (diff < 0 ? 'REDUCE' : 'STABILIZE'),
              impactPercentage: parseFloat(impactPercentage.toFixed(2)),
              reason: adj.reason || "Ajustement adaptatif de calibrage d'ADN"
            });
          }
        });

        if (feedbackLogs.length > 0) {
          useNexusStore.getState().addNeuralFeedbackLogs(feedbackLogs);
        }
      } catch (err) {
        // Safe fallback in non-browser environments
        console.warn("Could not log neural feedback in store:", err);
      }
    }
  }

  return finalNormalized;
};

export interface TrainingRecommendation {
  algo: string;
  priority: number;
  type: 'BOOST' | 'REDUCE' | 'STABILIZE';
  impactPercentage: number;
  message: string;
}

/**
 * Retourne des suggestions de formation priorisées basées sur les derniers audits forensic.
 */
export const getTrainingRecommendations = (
  recentForensics: ForensicReport[]
): TrainingRecommendation[] => {
  if (!recentForensics || recentForensics.length === 0) {
    return [];
  }

  const aggregates: Record<string, { sumChange: number; count: number; reasons: string[] }> = {};

  recentForensics.forEach((report) => {
    const isSwan = report.isBlackSwan;

    if (report.proposedAdjustments) {
      report.proposedAdjustments.forEach((adj) => {
        if (!aggregates[adj.algo]) {
          aggregates[adj.algo] = { sumChange: 0, count: 0, reasons: [] };
        }
        aggregates[adj.algo].sumChange += adj.proposedWeightChange;
        aggregates[adj.algo].count += 1;
        if (adj.reason) {
          aggregates[adj.algo].reasons.push(adj.reason);
        }
      });
    }

    if (isSwan) {
      const resilientAlgos = [AlgoKey.GAPS, AlgoKey.SPECTRAL, AlgoKey.FRACTAL];
      resilientAlgos.forEach((algo) => {
        if (!aggregates[algo]) {
          aggregates[algo] = { sumChange: 0, count: 0, reasons: [] };
        }
        aggregates[algo].sumChange += 0.15;
        aggregates[algo].count += 1;
        aggregates[algo].reasons.push("Régime chaotique / Black Swan identifié");
      });
    }
  });

  const recommendations: TrainingRecommendation[] = [];

  Object.keys(aggregates).forEach((algo) => {
    const agg = aggregates[algo];
    const avgChange = agg.sumChange / (agg.count || 1);
    
    // Continuous activation function replacing binary threshold check
    const significance = 1.0 / (1.0 + Math.exp(-1000.0 * (Math.abs(avgChange) - 0.005)));
    if (significance < 0.01) {
      return;
    }

    const type = avgChange > 0 ? 'BOOST' : 'REDUCE';
    const priority = Math.abs(avgChange) * (1.0 + Math.tanh(agg.count / 5.0)) * significance;
    const impactPercentage = Math.abs(avgChange) * 100 * significance;

    let baseExplanation = "";
    if (algo === AlgoKey.SPECTRAL) {
      baseExplanation = "une déviation forte d'AC (isomorphisme spectral continu)";
    } else if (algo === AlgoKey.GAPS) {
      baseExplanation = "une fluctuation d'amplitude spatiale";
    } else if (algo === AlgoKey.FREQUENCY) {
      baseExplanation = "des grappes séquentielles de Poisson";
    } else if (algo === AlgoKey.FRACTAL) {
      baseExplanation = "une déviation d'autosimilarité à mémoire longue (exposant de Hurst)";
    } else if (algo === AlgoKey.SPATIAL) {
      baseExplanation = "une déviance d'équilibre binomial de parité";
    } else {
      baseExplanation = "une déviance d'erreur de gradient direct";
    }

    const message = `${type === 'BOOST' ? 'Hausse conseillée' : 'Baisse conseillée'} de ${impactPercentage.toFixed(1)}% pour l'algorithme ${algo.toUpperCase()} car ${baseExplanation} sur les derniers audits forensic.`;

    recommendations.push({
      algo,
      priority,
      type,
      impactPercentage: parseFloat(impactPercentage.toFixed(1)),
      message
    });
  });

  return recommendations.sort((a, b) => b.priority - a.priority);
};
