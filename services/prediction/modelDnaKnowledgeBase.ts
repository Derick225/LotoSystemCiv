import { AlgoWeights } from '../../types';
import { AlgoKey } from '../../shared/prediction.types';
import { getDefaultWeights, normalizeWeights } from './weightsManager';
import { getDeterministicUUID } from '../../utils/mathUtils';

export type ModelDnaOrigin =
  | 'INITIAL'
  | 'SGD_CYBERNETIC'
  | 'FORENSIC_AUTOPSY'
  | 'GENETIC_EVOLUTION'
  | 'HYPERPARAM_TUNER'
  | 'MANUAL_CALIBRATION';

export interface AlgorithmicSpecialization {
  algoKey: AlgoKey | string;
  weight: number;
  deltaFromCanonical: number;
  dominanceRank: number;
  impactScore: number;
}

export interface ModelDnaRecord {
  id: string;
  drawName: string;
  version: string;
  timestamp: string;
  origin: ModelDnaOrigin;
  weights: AlgoWeights;
  dnaFingerprint: string;
  performance: {
    score: number;
    relativeGain?: number;
    brierScore?: number;
    rmse?: number;
    topologicalLoss?: number;
    hitRate?: number;
  };
  regimeContext?: {
    regime: string;
    hurst: number;
    entropy: number;
  };
  specializations: AlgorithmicSpecialization[];
  causalAuditTrail: string[];
}

export interface ModelEvolutionLineage {
  drawName: string;
  totalGenerations: number;
  latestVersion: string;
  firstRecordedAt: string;
  lastUpdatedAt: string;
  overallScoreProgression: {
    timestamp: string;
    score: number;
    relativeGain?: number;
    origin: ModelDnaOrigin;
  }[];
  overallGainPct: number;
  stabilityIndex: number; // 0-100%, calculé de façon continue via la variance des poids dans le temps
  dominantAlgorithmsOverTime: {
    algoKey: string;
    averageWeight: number;
    peakWeight: number;
    driftFrequency: number;
  }[];
  history: ModelDnaRecord[];
}

/**
 * Calcule l'empreinte ADN cryptographique/statistique déterministe d'une configuration de modèle
 */
export const computeModelDnaFingerprint = (drawName: string, weights: AlgoWeights, timestamp: string): string => {
  const sortedEntries = Object.entries(weights).sort(([k1], [k2]) => k1.localeCompare(k2));
  let hash = 0;
  const rawStr = `${drawName}::${sortedEntries.map(([k, v]) => `${k}:${(v || 0).toFixed(6)}`).join('|')}::${timestamp}`;
  for (let i = 0; i < rawStr.length; i++) {
    hash = (hash << 5) - hash + rawStr.charCodeAt(i);
    hash |= 0;
  }
  return `dna_${Math.abs(hash).toString(16)}`;
};

/**
 * Analyse et extrait les spécialisations algorithmiques de manière continue
 */
export const extractSpecializations = (weights: AlgoWeights): AlgorithmicSpecialization[] => {
  const canonical = getDefaultWeights();
  const sorted = Object.entries(weights)
    .filter(([_, w]) => typeof w === 'number')
    .sort(([_, a], [__, b]) => b - a);

  return sorted.map(([k, w], index) => {
    const canonVal = (canonical as Record<string, number>)[k] ?? (1.0 / Math.max(1, sorted.length));
    const delta = w - canonVal;
    const impactScore = Math.abs(delta) * (1.0 / (index + 1.0));
    return {
      algoKey: k,
      weight: parseFloat(w.toFixed(5)),
      deltaFromCanonical: parseFloat(delta.toFixed(5)),
      dominanceRank: index + 1,
      impactScore: parseFloat(impactScore.toFixed(5)),
    };
  });
};

const DNA_IN_MEMORY_STORAGE = new Map<string, ModelDnaRecord[]>();

/**
 * Enregistre une version dans la base de connaissances ADN du modèle pour le tirage actif.
 * Conforme à la règle d'isolation absolue des tirages (TIRAGE ISOLATION RULE).
 */
export const recordModelDnaVersion = async (
  entry: Omit<ModelDnaRecord, 'id' | 'timestamp' | 'dnaFingerprint' | 'specializations' | 'version'> & {
    timestamp?: string;
    version?: string;
  }
): Promise<ModelDnaRecord> => {
  const drawName = entry.drawName;
  const timestamp = entry.timestamp || new Date().toISOString();
  const normalizedWeights = normalizeWeights(entry.weights);
  const fingerprint = computeModelDnaFingerprint(drawName, normalizedWeights, timestamp);
  const specializations = extractSpecializations(normalizedWeights);

  const newRecord: ModelDnaRecord = {
    id: getDeterministicUUID(`modeldna_${drawName}_${fingerprint}`),
    drawName,
    version: entry.version || `v_${Date.now()}`,
    timestamp,
    origin: entry.origin,
    weights: normalizedWeights,
    dnaFingerprint: fingerprint,
    performance: entry.performance,
    regimeContext: entry.regimeContext,
    specializations,
    causalAuditTrail: entry.causalAuditTrail || [],
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const storageKey = `lotopro_model_dna_${drawName}`;
      const existingRaw = window.localStorage.getItem(storageKey);
      let existingList: ModelDnaRecord[] = existingRaw ? JSON.parse(existingRaw) : [];

      // Dédoublonnage sur empreinte ADN
      existingList = existingList.filter(r => r.dnaFingerprint !== fingerprint);
      existingList.unshift(newRecord);

      // Limite historique déterministe (garde les 60 derniers points d'évolution)
      if (existingList.length > 60) {
        existingList = existingList.slice(0, 60);
      }

      window.localStorage.setItem(storageKey, JSON.stringify(existingList));

      // Déclenche l'événement pour les composants réactifs
      window.dispatchEvent(
        new CustomEvent('MODEL_DNA_UPDATED', { detail: { drawName, versionId: newRecord.id } })
      );
    } catch (e) {
      console.error('[ModelDnaKnowledgeBase] Erreur lors de la persistance ADN:', e);
    }
  } else {
    // In-memory fallback
    const existing = DNA_IN_MEMORY_STORAGE.get(drawName) || [];
    const filtered = existing.filter(r => r.dnaFingerprint !== fingerprint);
    filtered.unshift(newRecord);
    if (filtered.length > 60) filtered.pop();
    DNA_IN_MEMORY_STORAGE.set(drawName, filtered);
  }

  return newRecord;
};

/**
 * Récupère l'historique complet d'évolution des modèles pour un tirage isolé.
 */
export const getModelDnaHistory = async (drawName: string, limit = 50): Promise<ModelDnaRecord[]> => {
  if (typeof window === 'undefined' || !window.localStorage) {
    const list = DNA_IN_MEMORY_STORAGE.get(drawName) || [];
    return list.slice(0, limit);
  }
  try {
    const storageKey = `lotopro_model_dna_${drawName}`;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return (DNA_IN_MEMORY_STORAGE.get(drawName) || []).slice(0, limit);
    const list: ModelDnaRecord[] = JSON.parse(raw);
    return Array.isArray(list) ? list.slice(0, limit) : [];
  } catch (e) {
    console.error('[ModelDnaKnowledgeBase] Erreur lors de la lecture:', e);
    return (DNA_IN_MEMORY_STORAGE.get(drawName) || []).slice(0, limit);
  }
};

/**
 * Synthétise la lignée évolutive complète (traçabilité, stabilité, dérive) pour un tirage.
 */
export const getModelEvolutionLineage = async (drawName: string): Promise<ModelEvolutionLineage> => {
  const history = await getModelDnaHistory(drawName, 60);

  if (history.length === 0) {
    return {
      drawName,
      totalGenerations: 0,
      latestVersion: 'v_canonical',
      firstRecordedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      overallScoreProgression: [],
      overallGainPct: 0,
      stabilityIndex: 100,
      dominantAlgorithmsOverTime: [],
      history: [],
    };
  }

  const latest = history[0];
  const oldest = history[history.length - 1];

  const progression = history.map(r => ({
    timestamp: r.timestamp,
    score: r.performance.score,
    relativeGain: r.performance.relativeGain,
    origin: r.origin,
  }));

  const initialScore = oldest.performance.score;
  const currentScore = latest.performance.score;
  const overallGainPct = initialScore > 0 ? ((currentScore - initialScore) / initialScore) * 100 : 0;

  // Calcul continu de la stabilité temporelle par dispersion des poids (Zéro nombre magique)
  const algoWeightHistory: Record<string, number[]> = {};
  history.forEach(r => {
    Object.entries(r.weights).forEach(([algo, weight]) => {
      if (!algoWeightHistory[algo]) algoWeightHistory[algo] = [];
      algoWeightHistory[algo].push(weight);
    });
  });

  let totalVarianceSum = 0;
  let trackedAlgosCount = 0;
  const dominantList: ModelEvolutionLineage['dominantAlgorithmsOverTime'] = [];

  Object.entries(algoWeightHistory).forEach(([algo, weights]) => {
    trackedAlgosCount++;
    const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
    const variance = weights.reduce((sum, w) => sum + Math.pow(w - avg, 2), 0) / weights.length;
    totalVarianceSum += variance;
    const peak = Math.max(...weights);
    const driftCount = weights.filter((w, idx) => idx > 0 && Math.abs(w - weights[idx - 1]) > 0.02).length;

    dominantList.push({
      algoKey: algo,
      averageWeight: parseFloat(avg.toFixed(5)),
      peakWeight: parseFloat(peak.toFixed(5)),
      driftFrequency: parseFloat((driftCount / Math.max(1, weights.length - 1)).toFixed(3)),
    });
  });

  dominantList.sort((a, b) => b.averageWeight - a.averageWeight);

  const meanVariance = trackedAlgosCount > 0 ? totalVarianceSum / trackedAlgosCount : 0;
  // Stabilité continue : 100 * exp(-10 * stdDev)
  const stdDev = Math.sqrt(meanVariance);
  const stabilityIndex = Math.max(0, Math.min(100, Math.round(100.0 * Math.exp(-15.0 * stdDev))));

  return {
    drawName,
    totalGenerations: history.length,
    latestVersion: latest.version,
    firstRecordedAt: oldest.timestamp,
    lastUpdatedAt: latest.timestamp,
    overallScoreProgression: progression,
    overallGainPct: parseFloat(overallGainPct.toFixed(2)),
    stabilityIndex,
    dominantAlgorithmsOverTime: dominantList.slice(0, 10),
    history,
  };
};

/**
 * Restaure une version spécifique de l'ADN d'un modèle pour un tirage
 */
export const rollbackToModelDnaVersion = async (
  drawName: string,
  recordId: string
): Promise<ModelDnaRecord | null> => {
  const history = await getModelDnaHistory(drawName, 60);
  const target = history.find(r => r.id === recordId);
  if (!target) return null;

  // Créer un enregistrement de restauration
  const rollbackRecord = await recordModelDnaVersion({
    drawName,
    version: `rollback_${target.version}_${Date.now()}`,
    origin: 'MANUAL_CALIBRATION',
    weights: target.weights,
    performance: target.performance,
    regimeContext: target.regimeContext,
    causalAuditTrail: [
      `Restauration déterministe vers la version ${target.version} (${target.dnaFingerprint})`,
    ],
  });

  return rollbackRecord;
};
