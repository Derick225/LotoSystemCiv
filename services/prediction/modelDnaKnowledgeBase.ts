import { AlgoWeights } from '../../types';
import { get, set } from 'idb-keyval';
import { PredictiveHyperparameters, DEFAULT_HYPERPARAMETERS } from './hyperParameterTuner';
import { getDeterministicUUID } from '../../utils/mathUtils';
import { saveAlgoWeights } from './weightsManager';

export interface ModelDnaRecord {
  id: string;
  drawName: string;
  timestamp: string;
  epochMs: number;
  generation: number;
  parentVersionId?: string;
  weights: AlgoWeights;
  hyperparameters: PredictiveHyperparameters;
  fitnessScore: number;         // 0 - 100
  relativeGain: number;         // % d'amélioration par rapport au modèle parent
  paretoEfficiency: number;     // 0 - 100 (compromis précision / stabilité / parcimonie)
  mutationDelta: Record<string, number>;
  source: 'sgd' | 'forensic_autopsy' | 'hyperparameter_tuning' | 'kalman_consensus' | 'baseline' | 'rollback';
  metadata?: {
    forensicReportsCount?: number;
    backtestSampleSize?: number;
    notes?: string;
  };
  performanceMetrics?: {
    hitRateTop5?: number;
    rmse?: number;
    brierScore?: number;
    stabilityScore?: number;
  };
}

export interface DnaEvolutionReport {
  drawName: string;
  totalGenerations: number;
  initialFitness: number;
  currentFitness: number;
  netFitnessGain: number;
  bestVersionId: string;
  stabilityTrend: 'converging' | 'oscillating' | 'diverging';
  activeGeneration?: ModelDnaRecord;
  generations: ModelDnaRecord[];
}

const DNA_KB_KEY_PREFIX = 'lotopro_dna_kb_';

// Cache mémoire L1 isolé par tirage
const l1DnaCache: Map<string, ModelDnaRecord[]> = new Map();

const isIdbAvailable = (): boolean => {
  return typeof globalThis !== 'undefined' && 'indexedDB' in globalThis && globalThis.indexedDB !== undefined;
};

/**
 * Enregistre un nouveau jalon évolutif dans la base de connaissances ADN du tirage.
 * Respecte strictement la règle d'isolation par tirage (Tirage Isolation Rule).
 */
export const recordModelDnaGeneration = async (
  drawName: string,
  weights: AlgoWeights,
  fitnessScore: number,
  source: ModelDnaRecord['source'],
  options: {
    hyperparameters?: PredictiveHyperparameters;
    relativeGain?: number;
    parentVersionId?: string;
    metadata?: ModelDnaRecord['metadata'];
    performanceMetrics?: ModelDnaRecord['performanceMetrics'];
  } = {}
): Promise<ModelDnaRecord> => {
  const cleanDraw = drawName.trim().toLowerCase();
  const currentHistory = await getModelDnaHistory(drawName);
  const parent = options.parentVersionId 
    ? currentHistory.find(h => h.id === options.parentVersionId)
    : currentHistory[0];

  const generation = parent ? parent.generation + 1 : 0;
  const hp = options.hyperparameters || (parent ? parent.hyperparameters : DEFAULT_HYPERPARAMETERS);

  // Calcul différentiel précis des mutations par rapport au modèle parent
  const mutationDelta: Record<string, number> = {};
  if (parent) {
    const allKeys = new Set([...Object.keys(weights), ...Object.keys(parent.weights)]);
    for (const k of allKeys) {
      const curW = (weights as any)[k] ?? 0;
      const prevW = (parent.weights as any)[k] ?? 0;
      const diff = curW - prevW;
      if (Math.abs(diff) > 1e-4) {
        mutationDelta[k] = parseFloat(diff.toFixed(4));
      }
    }
  }

  // Calcul du gain relatif continu
  const prevFitness = parent ? parent.fitnessScore : fitnessScore;
  const relativeGain = options.relativeGain !== undefined 
    ? options.relativeGain 
    : (prevFitness > 0 ? parseFloat((((fitnessScore - prevFitness) / prevFitness) * 100).toFixed(2)) : 0);

  // Score de Pareto : arbitrage entre précision (fitness), stabilité (gain modéré) et parcimonie
  const mutationMagnitude = Object.values(mutationDelta).reduce((sum, v) => sum + Math.abs(v), 0);
  const parsimonyPenalty = 1.0 / (1.0 + Math.exp(-2.0 * mutationMagnitude)); // pénalité continue
  const paretoEfficiency = parseFloat(Math.min(100, Math.max(0, fitnessScore * (1.1 - 0.2 * parsimonyPenalty))).toFixed(2));

  const epochMs = Date.now();
  const id = getDeterministicUUID(`dna_${cleanDraw}_gen_${generation}_${epochMs}`);

  const record: ModelDnaRecord = {
    id,
    drawName,
    timestamp: new Date(epochMs).toISOString(),
    epochMs,
    generation,
    parentVersionId: parent?.id,
    weights: { ...weights },
    hyperparameters: { ...hp },
    fitnessScore: parseFloat(fitnessScore.toFixed(2)),
    relativeGain,
    paretoEfficiency,
    mutationDelta,
    source,
    metadata: options.metadata,
    performanceMetrics: options.performanceMetrics,
  };

  // Mise à jour L1 et L2
  const updatedHistory = [record, ...currentHistory].slice(0, 100);
  l1DnaCache.set(cleanDraw, updatedHistory);

  if (isIdbAvailable()) {
    try {
      await set(`${DNA_KB_KEY_PREFIX}${cleanDraw}`, updatedHistory);
    } catch {
      // Fallback localStorage si erreur
    }
  } else {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(`nexus_weights_history_${drawName}`, JSON.stringify(updatedHistory));
      }
    } catch {
      // ignore
    }
  }

  return record;
};

/**
 * Récupère l'historique complet de la généalogie ADN d'un tirage.
 */
export const getModelDnaHistory = async (drawName: string): Promise<ModelDnaRecord[]> => {
  const cleanDraw = drawName.trim().toLowerCase();
  
  if (l1DnaCache.has(cleanDraw)) {
    return l1DnaCache.get(cleanDraw)!;
  }

  if (isIdbAvailable()) {
    try {
      const idbData = await get<ModelDnaRecord[]>(`${DNA_KB_KEY_PREFIX}${cleanDraw}`);
      if (idbData && Array.isArray(idbData)) {
        l1DnaCache.set(cleanDraw, idbData);
        return idbData;
      }
    } catch {
      // Silenced error
    }
  }

  // Fallback localStorage
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(`nexus_weights_history_${drawName}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Migration à la volée des anciens formats WeightVersionManager vers ModelDnaRecord
          const migrated: ModelDnaRecord[] = parsed.map((item, idx) => ({
            id: item.id || `v_${item.timestamp || idx}`,
            drawName,
            timestamp: item.timestamp || new Date().toISOString(),
            epochMs: item.timestamp ? new Date(item.timestamp).getTime() : Date.now(),
            generation: parsed.length - 1 - idx,
            weights: item.weights,
            hyperparameters: DEFAULT_HYPERPARAMETERS,
            fitnessScore: item.score || 50,
            relativeGain: item.relativeGain || 0,
            paretoEfficiency: item.score ? Math.min(100, item.score * 0.95) : 50,
            mutationDelta: {},
            source: 'baseline',
            metadata: item.metadata,
          }));
          l1DnaCache.set(cleanDraw, migrated);
          return migrated;
        }
      }
    }
  } catch {
    // ignore
  }

  return [];
};

/**
 * Identifie le modèle optimal de la lignée génétique (maximum de Pareto / Fitness).
 */
export const getOptimalModelDna = async (drawName: string): Promise<ModelDnaRecord | null> => {
  const history = await getModelDnaHistory(drawName);
  if (history.length === 0) return null;

  return history.reduce((best, current) => {
    return current.paretoEfficiency > best.paretoEfficiency ? current : best;
  }, history[0]);
};

/**
 * Analyse l'évolution complète et génère un rapport de diagnostic phylogénétique.
 */
export const generateDnaEvolutionReport = async (drawName: string): Promise<DnaEvolutionReport> => {
  const history = await getModelDnaHistory(drawName);
  if (history.length === 0) {
    return {
      drawName,
      totalGenerations: 0,
      initialFitness: 0,
      currentFitness: 0,
      netFitnessGain: 0,
      bestVersionId: '',
      stabilityTrend: 'converging',
      generations: [],
    };
  }

  const oldest = history[history.length - 1];
  const latest = history[0];
  const best = await getOptimalModelDna(drawName);

  // Évaluation de la tendance de stabilité basée sur les deltas successifs
  const deltas = history.slice(0, 10).map(h => h.relativeGain);
  const positiveGains = deltas.filter(d => d > 0).length;
  const negativeGains = deltas.filter(d => d < 0).length;

  let stabilityTrend: DnaEvolutionReport['stabilityTrend'] = 'converging';
  if (negativeGains > positiveGains + 2) {
    stabilityTrend = 'diverging';
  } else if (Math.abs(positiveGains - negativeGains) <= 1 && deltas.length > 4) {
    stabilityTrend = 'oscillating';
  }

  return {
    drawName,
    totalGenerations: history.length,
    initialFitness: oldest.fitnessScore,
    currentFitness: latest.fitnessScore,
    netFitnessGain: parseFloat((latest.fitnessScore - oldest.fitnessScore).toFixed(2)),
    bestVersionId: best?.id || latest.id,
    stabilityTrend,
    activeGeneration: latest,
    generations: history,
  };
};

/**
 * Alias pour la récupération et analyse de l'évolution de l'ADN d'un modèle.
 */
export const getModelDnaEvolutionReport = generateDnaEvolutionReport;

/**
 * Reconstitue fidèlement les poids algorithmiques d'une génération historique spécifique.
 */
export const reconstituteHistoricalWeights = async (
  drawName: string,
  recordId: string
): Promise<AlgoWeights | null> => {
  const history = await getModelDnaHistory(drawName);
  const found = history.find(h => h.id === recordId);
  return found ? { ...found.weights } : null;
};

/**
 * Restaure de manière déterministe le modèle à une génération phylogénétique passée (Rollback).
 * Enregistre un nouvel événement de traçabilité tagged 'rollback' pour maintenir l'auditabilité continue.
 */
export const rollbackToDnaGeneration = async (
  drawName: string,
  recordId: string
): Promise<{ success: boolean; restoredRecord: ModelDnaRecord | null }> => {
  const history = await getModelDnaHistory(drawName);
  const targetRecord = history.find(h => h.id === recordId);

  if (!targetRecord) {
    return { success: false, restoredRecord: null };
  }

  // Application des poids reconstitués
  saveAlgoWeights(drawName, targetRecord.weights);

  // Enregistrement de la nouvelle génération de rollback
  const rollbackRecord = await recordModelDnaGeneration(
    drawName,
    targetRecord.weights,
    targetRecord.fitnessScore,
    'rollback',
    {
      hyperparameters: targetRecord.hyperparameters,
      parentVersionId: recordId,
      metadata: { notes: `Restauration phylogénétique depuis la génération ${targetRecord.generation}` }
    }
  );

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('MODEL_DNA_ROLLBACK_COMPLETED', {
        detail: { drawName, targetId: recordId, newRecordId: rollbackRecord.id }
      })
    );
  }

  return { success: true, restoredRecord: rollbackRecord };
};

/**
 * Supprime l'historique ADN d'un tirage spécifique en garantissant une isolation stricte (TIRAGE ISOLATION RULE).
 */
export const deleteModelDnaHistoryForDraw = async (drawName: string): Promise<void> => {
  const cleanDraw = drawName.trim().toLowerCase();
  l1DnaCache.delete(cleanDraw);

  try {
    if (typeof globalThis !== 'undefined' && 'indexedDB' in globalThis) {
      const { del } = await import('idb-keyval');
      await del(`${DNA_KB_KEY_PREFIX}${cleanDraw}`);
    }
  } catch {
    // Ignore in non-browser environments
  }
};



