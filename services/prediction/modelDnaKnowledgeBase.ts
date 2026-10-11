import { AlgoWeights } from '../../types';
import { AlgoKey } from '../../shared/prediction.types';
import { getDefaultWeights, normalizeWeights, saveAlgoWeights } from './weightsManager';
import { getDeterministicUUID } from '../../utils/mathUtils';
import { get as idbGet, set as idbSet } from 'idb-keyval';

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
    // Absent lorsqu'aucune mesure de performance réelle n'existe pour cette version :
    // une sauvegarde de poids manuelle n'est pas une performance mesurée.
    score?: number;
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
    // score/relativeGain absents (trou dans la courbe, "n/d") quand la version
    // n'a jamais été mesurée par un backtest.
    score?: number;
    relativeGain?: number;
    origin: ModelDnaOrigin;
  }[];
  // Gain global mesuré uniquement entre versions réellement scorées ; null (n/d) sinon.
  overallGainPct: number | null;
  // 0-100%, calculé de façon continue via la variance des poids dans le temps.
  // null lorsqu'aucune génération n'est archivée : aucune mesure de stabilité n'existe.
  stabilityIndex: number | null;
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
export const computeModelDnaFingerprint = (drawName: string, weights: AlgoWeights): string => {
  const sortedEntries = Object.entries(weights).sort(([k1], [k2]) => k1.localeCompare(k2));
  // L'empreinte identifie une configuration ADN (tirage + poids normalisés) : le timestamp
  // en est volontairement exclu pour que le dédoublonnage sur empreinte soit effectif.
  // Hachage déterministe 64 bits (double FNV-1a 32 bits couplé) pour éviter les collisions 32 bits.
  const rawStr = `${drawName}::${sortedEntries.map(([k, v]) => `${k}:${(v || 0).toFixed(6)}`).join('|')}`;
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0x01000193 >>> 0;
  for (let i = 0; i < rawStr.length; i++) {
    const code = rawStr.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= code ^ ((i & 0xff) << 8);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `dna_${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
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
    preserveExistingOnCollision?: boolean;
  }
): Promise<ModelDnaRecord> => {
  const drawName = entry.drawName;
  const timestamp = entry.timestamp || new Date().toISOString();
  const normalizedWeights = normalizeWeights(entry.weights);
  const fingerprint = computeModelDnaFingerprint(drawName, normalizedWeights);
  const specializations = extractSpecializations(normalizedWeights);

  const storageKey = `lotopro_model_dna_${drawName}`;
  let existingList: ModelDnaRecord[] = DNA_IN_MEMORY_STORAGE.get(drawName) || [];

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const existingRaw = window.localStorage.getItem(storageKey);
      if (existingRaw) {
        const parsed = JSON.parse(existingRaw);
        if (Array.isArray(parsed)) existingList = parsed;
      }
    } catch (e) {
      console.warn('[ModelDnaKnowledgeBase] Lecture localStorage repliée sur mémoire:', e);
    }
  }

  // En cas de collision d'empreinte, fusionner sans perdre les métriques de performance ni l'historique causal
  const existingMatch = existingList.find((r) => r.dnaFingerprint === fingerprint);
  const mergedPerformance: ModelDnaRecord['performance'] = {
    ...(existingMatch?.performance || {}),
    ...Object.fromEntries(
      Object.entries(entry.performance || {}).filter(([_, v]) => v !== undefined)
    ),
  };
  const mergedAuditTrail = existingMatch
    ? Array.from(new Set([...(entry.causalAuditTrail || []), ...existingMatch.causalAuditTrail])).slice(0, 20)
    : entry.causalAuditTrail || [];

  const recordVersion =
    entry.preserveExistingOnCollision && existingMatch
      ? existingMatch.version
      : entry.version || `v_${Date.now()}`;
  const recordOrigin =
    entry.preserveExistingOnCollision && existingMatch
      ? existingMatch.origin
      : entry.origin;

  const newRecord: ModelDnaRecord = {
    id: existingMatch?.id || getDeterministicUUID(`modeldna_${drawName}_${fingerprint}`),
    drawName,
    version: recordVersion,
    timestamp,
    origin: recordOrigin,
    weights: normalizedWeights,
    dnaFingerprint: fingerprint,
    performance: mergedPerformance,
    regimeContext: entry.regimeContext || existingMatch?.regimeContext,
    specializations,
    causalAuditTrail: mergedAuditTrail,
  };

  existingList = existingList.filter((r) => r.dnaFingerprint !== fingerprint);
  existingList.unshift(newRecord);

  // Limite historique déterministe (garde les 60 derniers points d'évolution)
  if (existingList.length > 60) {
    existingList = existingList.slice(0, 60);
  }

  // Miroir mémoire systématique (garantit zéro perte même si localStorage dépasse son quota)
  DNA_IN_MEMORY_STORAGE.set(drawName, existingList);

  if (typeof window !== 'undefined') {
    if (window.localStorage) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(existingList));
      } catch (quotaErr) {
        // En cas de dépassement de quota localStorage, compacter à 25 entrées et persister dans IndexedDB
        try {
          const compactList = existingList.slice(0, 25);
          window.localStorage.setItem(storageKey, JSON.stringify(compactList));
        } catch {
          console.warn('[ModelDnaKnowledgeBase] Quota localStorage saturé, bascule IndexedDB/mémoire.');
        }
      }
    }
    try {
      await idbSet(storageKey, existingList);
    } catch {
      // Ignorer en environnement de test sans IndexedDB
    }
    window.dispatchEvent(
      new CustomEvent('MODEL_DNA_UPDATED', { detail: { drawName, versionId: newRecord.id } })
    );
  }

  return newRecord;
};

/**
 * Récupère l'historique complet d'évolution des modèles pour un tirage isolé.
 */
export const getModelDnaHistory = async (drawName: string, limit = 50): Promise<ModelDnaRecord[]> => {
  const storageKey = `lotopro_model_dna_${drawName}`;
  const memList = DNA_IN_MEMORY_STORAGE.get(drawName);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const list: ModelDnaRecord[] = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          DNA_IN_MEMORY_STORAGE.set(drawName, list);
          return list.slice(0, limit);
        }
      }
    } catch (e) {
      console.warn('[ModelDnaKnowledgeBase] Erreur lecture localStorage:', e);
    }
  }

  if (memList && memList.length > 0) {
    return memList.slice(0, limit);
  }

  if (typeof window !== 'undefined') {
    try {
      const idbList = await idbGet<ModelDnaRecord[]>(storageKey);
      if (Array.isArray(idbList) && idbList.length > 0) {
        DNA_IN_MEMORY_STORAGE.set(drawName, idbList);
        return idbList.slice(0, limit);
      }
    } catch {
      // Ignorer si IndexedDB indisponible
    }
  }

  return [];
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
      overallGainPct: null,
      stabilityIndex: null,
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

  // Gain global : mesuré uniquement entre versions réellement scorées (n/d sinon).
  // Les versions sans score (sauvegardes manuelles, imports) sont exclues du calcul.
  const scoredHistory = history.filter((r) => typeof r.performance.score === 'number');
  const oldestScored = scoredHistory[scoredHistory.length - 1];
  const newestScored = scoredHistory[0];
  const overallGainPct =
    oldestScored && newestScored && Math.abs(oldestScored.performance.score!) > Number.EPSILON
      ? ((newestScored.performance.score! - oldestScored.performance.score!) / Math.abs(oldestScored.performance.score!)) * 100
      : null;

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
    // Dérive : mouvement de poids dépassant la dispersion propre de l'algorithme
    // (son écart-type historique), et non un seuil fixe arbitraire.
    const driftCount = weights.filter((w, idx) => idx > 0 && Math.abs(w - weights[idx - 1]) > Math.sqrt(variance)).length;

    dominantList.push({
      algoKey: algo,
      averageWeight: parseFloat(avg.toFixed(5)),
      peakWeight: parseFloat(peak.toFixed(5)),
      driftFrequency: parseFloat((driftCount / Math.max(1, weights.length - 1)).toFixed(3)),
    });
  });

  dominantList.sort((a, b) => b.averageWeight - a.averageWeight);

  const meanVariance = trackedAlgosCount > 0 ? totalVarianceSum / trackedAlgosCount : 0;
  const stdDev = Math.sqrt(meanVariance);
  // Stabilité continue : dispersion des poids mesurée en parts uniformes (1/A par algorithme,
  // A = nombre d'algorithmes suivis). Une dérive moyenne d'une part uniforme complète
  // (réaffectation totale de l'influence moyenne d'un algorithme) correspond à e^-1 de stabilité.
  const uniformShare = trackedAlgosCount > 0 ? 1.0 / trackedAlgosCount : 1.0;
  const stabilityIndex = Math.max(0, Math.min(100, Math.round(100.0 * Math.exp(-stdDev / uniformShare))));

  return {
    drawName,
    totalGenerations: history.length,
    latestVersion: latest.version,
    firstRecordedAt: oldest.timestamp,
    lastUpdatedAt: latest.timestamp,
    overallScoreProgression: progression,
    overallGainPct: overallGainPct != null ? parseFloat(overallGainPct.toFixed(2)) : null,
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

  // Persister les poids restaurés pour le tirage
  await saveAlgoWeights(drawName, target.weights);

  // Promouvoir l'enregistrement restauré en tête de lignée SANS écraser sa version, son origine ni ses performances
  const rollbackRecord = await recordModelDnaVersion({
    drawName,
    version: target.version,
    origin: target.origin,
    weights: target.weights,
    performance: target.performance,
    regimeContext: target.regimeContext,
    preserveExistingOnCollision: true,
    causalAuditTrail: [
      `Restauration déterministe vers la version ${target.version} (${target.dnaFingerprint})`,
      ...(target.causalAuditTrail || []),
    ],
  });

  return rollbackRecord;
};
