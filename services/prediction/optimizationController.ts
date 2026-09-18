import { AlgoWeights, DrawResult } from '../../types';
import { AlgoKey } from '../../shared/prediction.types';
import { normalizeWeights, getDefaultWeights, getAlgoWeights, saveAlgoWeights } from './weightsManager';
import {
  recordModelDnaVersion,
  ModelDnaOrigin,
  ModelDnaRecord,
  extractSpecializations,
  computeModelDnaFingerprint,
} from './modelDnaKnowledgeBase';
import { computeDeterministicCriticalThreshold } from './dnaAuditService';
import { calculateShannonEntropy, calculateVariance } from './deterministicCore';
import { updateWeightsWithKalmanFilter } from './kalmanWeightsFilter';
import { useNexusStore } from '../../store/useNexusStore';
import { logger } from '../../utils/logger';

export interface OptimizationRequest {
  drawName: string;
  weights: AlgoWeights;
  origin: ModelDnaOrigin;
  version?: string;
  timestamp?: string;
  history?: DrawResult[];
  useKalmanSmoothing?: boolean;
  performance?: {
    score?: number;
    relativeGain?: number;
    brierScore?: number;
    rmse?: number;
    topologicalLoss?: number;
    hitRate?: number;
  };
  regimeContext?: {
    regime: string;
    hurst?: number;
    entropy?: number;
  };
  causalAuditTrail?: string[];
  reason?: string;
  allowCriticalDrift?: boolean;
}

export interface OptimizationResponse {
  success: boolean;
  drawName: string;
  appliedWeights: AlgoWeights;
  dnaRecord: ModelDnaRecord;
  driftDelta: number;
  criticalThreshold: number;
  isCriticalDrift: boolean;
  wasDamped: boolean;
  dampingFactor: number;
  fingerprint: string;
  message: string;
}

/**
 * Calcule l'écart maximum (Z-drift) et la dérive globale entre deux configurations de poids.
 */
export function calculateWeightDriftMetrics(
  currentWeights: AlgoWeights,
  targetWeights: AlgoWeights
): { maxDelta: number; totalEnergy: number; driftedCount: number } {
  let maxDelta = 0;
  let totalEnergy = 0;
  let driftedCount = 0;

  const allKeys = Array.from(
    new Set([...Object.keys(currentWeights), ...Object.keys(targetWeights)])
  ) as AlgoKey[];

  for (const key of allKeys) {
    const cur = (currentWeights as any)[key] ?? 0;
    const tgt = (targetWeights as any)[key] ?? 0;
    const diff = Math.abs(tgt - cur);
    if (diff > maxDelta) maxDelta = diff;
    totalEnergy += diff * diff;
    if (diff > 0.01) driftedCount++;
  }

  return {
    maxDelta,
    totalEnergy: Math.sqrt(totalEnergy),
    driftedCount,
  };
}

/**
 * PASSERELLE D'OPTIMISATION CENTRALISÉE (Unified Optimization Gateway)
 * 
 * Garantit que TOUTE modification des poids algorithmiques (training, bayésien,
 * neuro-darwinisme, autopsie fermée ou tuning expert) :
 * 1. Est normalisée continûment.
 * 2. Vérifie et régule le seuil critique de dérive (tau) pour préserver la stabilité du gradient.
 * 3. Enregistre une version horodatée et signée dans la base de connaissances ADN (modelDnaKnowledgeBase).
 * 4. Propage instantanément la nouvelle signature aux composants, au store Nexus et aux moniteurs de surveillance.
 */
export async function applyOptimizedWeights(
  request: OptimizationRequest
): Promise<OptimizationResponse> {
  const {
    drawName,
    weights: rawTargetWeights,
    origin,
    history = [],
    performance = {},
    regimeContext,
    causalAuditTrail = [],
    reason,
    allowCriticalDrift = false,
  } = request;

  // 1. Normalisation continue des poids cibles
  const targetNormalized = normalizeWeights(rawTargetWeights);

  // 2. Récupération des poids courants
  const currentWeights = await getAlgoWeights(drawName);
  const normalizedCurrent = normalizeWeights(currentWeights);

  // 3. Calcul de la dérive et du seuil critique statistique continu (Zéro nombre magique)
  const algoCount = Object.keys(targetNormalized).length;
  
  let entropyVal = 0.85;
  let varianceVal = 0.005;

  if (history && history.length > 0) {
    const counts = new Array(91).fill(0);
    for (const d of history) {
      if (d.gagnants) {
        for (const num of d.gagnants) {
          if (num >= 1 && num <= 90) counts[num]++;
        }
      }
    }
    const totalHits = counts.reduce((a, b) => a + b, 0);
    if (totalHits > 0) {
      const probs = counts.slice(1).map((c) => c / totalHits);
      const hShannon = calculateShannonEntropy(probs);
      entropyVal = hShannon / Math.log2(90);
      varianceVal = calculateVariance(probs);
    }
  }

  const criticalThreshold = computeDeterministicCriticalThreshold(
    algoCount,
    entropyVal,
    varianceVal,
    90
  );

  const { maxDelta } = calculateWeightDriftMetrics(normalizedCurrent, targetNormalized);
  const isCriticalDrift = maxDelta > criticalThreshold;

  // 4. Régulation par amortissement continu si dérive critique non explicitement autorisée
  let appliedWeights: AlgoWeights = targetNormalized;
  let wasDamped = false;
  let dampingFactor = 1.0;

  if (isCriticalDrift && !allowCriticalDrift) {
    // Facteur d'amortissement continu différentiable
    dampingFactor = criticalThreshold / Math.max(criticalThreshold, maxDelta);
    wasDamped = true;

    const dampedRecord: Record<string, number> = {};
    const allKeys = Object.keys(targetNormalized) as AlgoKey[];
    for (const key of allKeys) {
      const cur = (normalizedCurrent as any)[key] ?? 0;
      const tgt = (targetNormalized as any)[key] ?? 0;
      dampedRecord[key] = cur + dampingFactor * (tgt - cur);
    }
    appliedWeights = normalizeWeights(dampedRecord as AlgoWeights);
  }

  // 4.b Lissage Kalman Adaptatif si demandé
  if (request.useKalmanSmoothing) {
    const kalmanRes = updateWeightsWithKalmanFilter({
      drawName,
      measuredWeights: appliedWeights,
      history,
      predictionError: performance.brierScore ?? performance.topologicalLoss,
      empiricalVariance: varianceVal,
    });
    appliedWeights = kalmanRes.updatedWeights;
  }

  // 5. Persistance des poids
  await saveAlgoWeights(drawName, appliedWeights);

  // 6. Enregistrement systématique dans la base de connaissances ADN
  const timestamp = new Date().toISOString();
  const calculatedPerformance = {
    score: performance.score ?? (100 - Math.min(100, maxDelta * 100)),
    relativeGain: performance.relativeGain ?? 0,
    brierScore: performance.brierScore,
    rmse: performance.rmse,
    topologicalLoss: performance.topologicalLoss,
    hitRate: performance.hitRate,
  };

  const fullAuditTrail = [
    ...(causalAuditTrail || []),
    reason ? `[Raison] ${reason}` : '',
    wasDamped
      ? `[Amortissement Dérive Critique] Delta=${(maxDelta * 100).toFixed(2)}% > Seuil=${(criticalThreshold * 100).toFixed(2)}% | Facteur=${dampingFactor.toFixed(3)}`
      : `[Application Directe] Delta=${(maxDelta * 100).toFixed(2)}% <= Seuil=${(criticalThreshold * 100).toFixed(2)}%`,
  ].filter(Boolean);

  const finalTimestamp = request.timestamp || timestamp;

  const dnaRecord = await recordModelDnaVersion({
    drawName,
    version: request.version,
    origin,
    weights: appliedWeights,
    timestamp: finalTimestamp,
    performance: calculatedPerformance,
    regimeContext: regimeContext
      ? {
          regime: regimeContext.regime,
          hurst: regimeContext.hurst ?? 0.5,
          entropy: regimeContext.entropy ?? entropyVal,
        }
      : undefined,
    causalAuditTrail: fullAuditTrail,
  });

  // 7. Mise à jour immédiate du Store Nexus si le tirage est le tirage actif
  try {
    const store = useNexusStore.getState();
    if (store.drawName === drawName) {
      store.setGlobalWeights(appliedWeights);
    }
  } catch (err) {
    logger.debug({ err }, '[OptimizationController] Notification store non bloquante');
  }

  // 8. Déclenchement des événements réactifs universels
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('OPTIMIZED_WEIGHTS_APPLIED', {
        detail: {
          drawName,
          appliedWeights,
          dnaRecord,
          origin,
          wasDamped,
          dampingFactor,
        },
      })
    );
  }

  return {
    success: true,
    drawName,
    appliedWeights,
    dnaRecord,
    driftDelta: maxDelta,
    criticalThreshold,
    isCriticalDrift,
    wasDamped,
    dampingFactor,
    fingerprint: dnaRecord.dnaFingerprint,
    message: wasDamped
      ? `Poids appliqués avec amortissement continu de sécurité (Δ=${(maxDelta * 100).toFixed(1)}% > ${(criticalThreshold * 100).toFixed(1)}%)`
      : `Poids optimisés appliqués avec succès (Empreinte ADN : ${dnaRecord.dnaFingerprint})`,
  };
}
