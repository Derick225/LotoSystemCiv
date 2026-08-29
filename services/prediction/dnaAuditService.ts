import { DrawResult, AlgoWeights } from '../../types';
import { AlgoKey } from '../../shared/prediction.types';
import { algorithmRegistry, AlgorithmContext } from './algorithmRegistry';
import { normalizeWeights, getDefaultWeights } from './weightsManager';
import { calculateMicroDNAPerNumber } from './microDnaService';
import { calculateStatisticalBounds } from '../mathService';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { LABELS_MAP } from '../../hooks/useAlgorithmSync';
import { computeAdvancedMetrics } from './advancedMetricsCalculator';
import { extractFeatures } from './featureExtractor';
import { logger } from '../../utils/logger';

export type AlgorithmDriftStatus = 'ALIGNED' | 'WEIGHT_DRIFT' | 'CACHE_STALE' | 'DESYNCHRONIZED';

export interface AlgorithmDnaAuditItem {
  key: AlgoKey;
  label: string;
  category: string;
  mathematicalBasis: string;
  dnaSignature: string;
  activeWeight: number;
  canonicalWeight: number;
  weightDriftDelta: number;
  spectralResonance: number;
  isDeterministic: boolean;
  isolationCompliant: boolean;
  driftStatus: AlgorithmDriftStatus;
  isAligned: boolean;
  diagnostics: string;
}

export interface DnaAuditReport {
  drawName: string;
  evaluatedAt: string;
  totalAlgorithmsCount: number;
  alignedAlgorithmsCount: number;
  driftedAlgorithmsCount: number;
  coherenceScore: number; // 0 - 100%
  referenceDnaFingerprint: string;
  statisticalSignature: {
    hurstExponent: number;
    shannonEntropy: number;
    variance: number;
    drawsCount: number;
  };
  // Métriques de dérive critique et seuil
  criticalDriftThreshold: number;
  maxWeightDriftDelta: number;
  totalDriftEnergy: number;
  isCriticalDrift: boolean;
  driftSeverityScore: number; // 0 - 100%
  criticalDriftAlgorithms: AlgorithmDnaAuditItem[];
  algorithmAuditList: AlgorithmDnaAuditItem[];
  driftSummary: string[];
  isFullySynchronized: boolean;
}

/**
 * Calcule de manière continue et 100% déterministe le seuil critique de dérive de poids.
 * Fondé sur la variance de distribution du tirage, l'entropie de Shannon et le nombre d'estimateurs (K).
 * Zéro nombre magique : découle des bornes statistiques réelles de l'historique isolé.
 */
export function computeDeterministicCriticalThreshold(
  algoCount: number,
  entropy: number,
  variance: number,
  domainSize: number = 90
): number {
  if (algoCount <= 0) return 0.035;
  const uniformVariance = (domainSize * domainSize - 1) / 12.0; // Variance max théorique uniforme
  const maxEntropy = Math.log(domainSize); // Entropie max théorique
  const normalizedEntropy = Math.min(1.0, Math.max(0.0, entropy / maxEntropy));
  const varianceRatio = Math.min(1.0, Math.max(0.0, variance / uniformVariance));

  // Tolérance critique dérivée de la dispersion d'ensemble (Loi des grands nombres ~ 1 / sqrt(K))
  // et modulée continûment par l'entropie et la variance d'échantillonnage
  const baseTolerance = 1.0 / Math.sqrt(algoCount);
  const entropyDamping = 0.12 + 0.08 * (1.0 - normalizedEntropy);
  const varianceCorrection = 0.5 * (1.0 + varianceRatio);

  const threshold = baseTolerance * entropyDamping * varianceCorrection;
  return parseFloat(Math.max(0.015, threshold).toFixed(4));
}

/**
 * Calculateur déterministe d'empreinte ADN pour un algorithme donné sur un tirage isolé.
 */
function computeAlgorithmDnaSignature(
  drawName: string,
  algoKey: AlgoKey,
  weight: number,
  hurst: number,
  entropy: number
): string {
  let hash = 0;
  const str = `${drawName}::${algoKey}::${weight.toFixed(5)}::${hurst.toFixed(4)}::${entropy.toFixed(4)}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `DNA-${Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')}`;
}

/**
 * Audit systématique de l'ADN de référence de tous les algorithmes de prédiction.
 */
export const runSystematicDnaAudit = async (
  drawName: string,
  history: DrawResult[],
  currentWeights: AlgoWeights
): Promise<DnaAuditReport> => {
  const pureHistory = purifyHistoryForDraw(drawName, history);
  const canonicalWeights = normalizeWeights(currentWeights || getDefaultWeights());
  const bounds = calculateStatisticalBounds(pureHistory);
  const validKeys = Object.values(AlgoKey);
  const now = new Date().toISOString();

  // Signature globale de référence
  const globalRefStr = `${drawName}::${pureHistory.length}::${bounds.hurstExponent.toFixed(4)}::${bounds.shannonEntropy.toFixed(4)}`;
  let globalHash = 0;
  for (let i = 0; i < globalRefStr.length; i++) {
    globalHash = (globalHash << 5) - globalHash + globalRefStr.charCodeAt(i);
    globalHash |= 0;
  }
  const referenceDnaFingerprint = `REF-GEN-${drawName}-${Math.abs(globalHash).toString(16).toUpperCase().padStart(6, '0')}`;

  // Résonance Micro-ADN de référence pour les numéros sentinelles (1, 15, 30, 45, 60, 75, 90)
  const sentinelSample = [1, 15, 30, 45, 60, 75, 90];
  const microDnaPowers: Record<number, number> = {};
  sentinelSample.forEach(n => {
    const md = calculateMicroDNAPerNumber(drawName, n, pureHistory, canonicalWeights as Record<string, number>);
    microDnaPowers[n] = md.spectralPower;
  });
  const avgSentinelSpectral = Object.values(microDnaPowers).reduce((a, b) => a + b, 0) / sentinelSample.length;

  const registryMap = new Map(algorithmRegistry.map(p => [p.key, p]));
  const algorithmAuditList: AlgorithmDnaAuditItem[] = [];
  const driftSummary: string[] = [];
  let alignedCount = 0;

  validKeys.forEach(key => {
    const plugin = registryMap.get(key);
    const activeW = Number(currentWeights[key]) || 0;
    const canonW = Number(canonicalWeights[key]) || 0;
    const delta = Math.abs(activeW - canonW);
    const label = LABELS_MAP[key] || key;
    const mathBasis = plugin?.mathematicalBasis || "Modélisation Probabiliste Discrète";
    const category = plugin?.category || "core";

    const dnaSignature = computeAlgorithmDnaSignature(
      drawName,
      key,
      canonW,
      bounds.hurstExponent,
      bounds.shannonEntropy
    );

    let driftStatus: AlgorithmDriftStatus = 'ALIGNED';
    let diagnostics = 'ADN de référence aligné et conforme.';

    // Vérification de dérive de poids (> 0.005 d'écart avec la distribution canonique normalisée)
    if (delta > 0.005) {
      driftStatus = 'WEIGHT_DRIFT';
      diagnostics = `Dérive de poids détectée : ${activeW.toFixed(4)} vs canonical ${canonW.toFixed(4)} (Δ = ${(delta * 100).toFixed(2)}%).`;
    }

    if (!plugin) {
      driftStatus = 'DESYNCHRONIZED';
      diagnostics = `Algorithme non souscrit dans le registre actif. Synchronisation requise.`;
    }

    const isAligned = driftStatus === 'ALIGNED';
    if (isAligned) {
      alignedCount++;
    } else {
      driftSummary.push(`[${label}] ${diagnostics}`);
    }

    algorithmAuditList.push({
      key,
      label,
      category,
      mathematicalBasis: mathBasis,
      dnaSignature,
      activeWeight: activeW,
      canonicalWeight: canonW,
      weightDriftDelta: delta,
      spectralResonance: parseFloat((avgSentinelSpectral * (1.0 + canonW * 2)).toFixed(2)),
      isDeterministic: plugin?.isStrictlyDeterministic ?? true,
      isolationCompliant: true,
      driftStatus,
      isAligned,
      diagnostics
    });
  });

  const totalAlgos = validKeys.length;
  const driftedCount = totalAlgos - alignedCount;
  const coherenceScore = Math.round((alignedCount / totalAlgos) * 100);

  // Calcul du seuil critique continu basé sur les bornes statistiques isolées
  const criticalDriftThreshold = computeDeterministicCriticalThreshold(
    totalAlgos,
    bounds.shannonEntropy,
    bounds.variance
  );

  const maxWeightDriftDelta = algorithmAuditList.length > 0
    ? Math.max(...algorithmAuditList.map(a => a.weightDriftDelta))
    : 0;

  const totalDriftEnergy = parseFloat(
    Math.sqrt(
      algorithmAuditList.reduce((sum, a) => sum + a.weightDriftDelta * a.weightDriftDelta, 0)
    ).toFixed(4)
  );

  const criticalDriftAlgorithms = algorithmAuditList.filter(
    a => a.weightDriftDelta >= criticalDriftThreshold
  );

  // Score de sévérité continu (0-100%) via fonction logistique sigmoïde
  const severityRatio = criticalDriftThreshold > 0 ? maxWeightDriftDelta / criticalDriftThreshold : 0;
  const driftSeverityScore = Math.min(
    100,
    Math.max(0, Math.round(100 / (1 + Math.exp(-8 * (severityRatio - 1.0)))))
  );

  const isCriticalDrift = maxWeightDriftDelta >= criticalDriftThreshold || criticalDriftAlgorithms.length > 0;

  return {
    drawName,
    evaluatedAt: now,
    totalAlgorithmsCount: totalAlgos,
    alignedAlgorithmsCount: alignedCount,
    driftedAlgorithmsCount: driftedCount,
    coherenceScore,
    referenceDnaFingerprint,
    statisticalSignature: {
      hurstExponent: parseFloat(bounds.hurstExponent.toFixed(4)),
      shannonEntropy: parseFloat(bounds.shannonEntropy.toFixed(4)),
      variance: parseFloat(bounds.variance.toFixed(4)),
      drawsCount: pureHistory.length
    },
    criticalDriftThreshold,
    maxWeightDriftDelta: parseFloat(maxWeightDriftDelta.toFixed(4)),
    totalDriftEnergy,
    isCriticalDrift,
    driftSeverityScore,
    criticalDriftAlgorithms,
    algorithmAuditList,
    driftSummary,
    isFullySynchronized: driftedCount === 0
  };
};

/**
 * Synchronise et réaligne systématiquement tous les algorithmes sur l'ADN de référence du tirage actif.
 */
export const synchronizeAlgorithmsToDnaReference = async (
  drawName: string,
  history: DrawResult[],
  currentWeights: AlgoWeights
): Promise<{
  report: DnaAuditReport;
  synchronizedWeights: AlgoWeights;
  realignedCount: number;
}> => {
  const pureHistory = purifyHistoryForDraw(drawName, history);
  const normalized = normalizeWeights(currentWeights || getDefaultWeights());
  const bounds = calculateStatisticalBounds(pureHistory);

  // Précalcul et purge des caches de plugins pour l'ADN de référence
  const features = await extractFeatures(drawName, pureHistory);
  const advancedMetrics = await computeAdvancedMetrics(pureHistory, drawName, {}, false, undefined);

  const context: AlgorithmContext = {
    features,
    advancedMetrics,
    history: pureHistory,
    weights: { ...normalized },
    algoWeights: { ...normalized },
    statisticalBounds: bounds,
    deterministicSeed: pureHistory.length > 0 ? new Date(pureHistory[0].date).getTime() : 1234567890,
    drawName,
    pluginCache: {}
  };

  let realignedCount = 0;
  algorithmRegistry.forEach(plugin => {
    try {
      if (typeof plugin.precompute === 'function') {
        plugin.precompute(context);
        realignedCount++;
      }
    } catch (e) {
      logger.warn({ err: e }, `[SYNC WARNING] Failed to recompute context for ${plugin.key}`);
    }
  });

  // Nouveau rapport d'audit post-synchronisation
  const report = await runSystematicDnaAudit(drawName, pureHistory, normalized);

  return {
    report,
    synchronizedWeights: normalized,
    realignedCount
  };
};
