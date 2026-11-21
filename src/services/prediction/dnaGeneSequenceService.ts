import {
  AlgoWeights,
  DrawResult,
  ForensicReport,
} from '../../types';
import {
  AlgoKey,
  RETIRED_ALGO_WEIGHT_KEYS,
} from '../../shared/prediction.types';
import { LABELS_MAP } from '../../hooks/useAlgorithmSync';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { parseDateSafely } from '../../utils/dateUtils';
import {
  drawHasMachineNumbers,
  getDrawNetworkId,
  INTER_DRAW_NETWORKS,
  normalizeDrawName,
} from '../../constants';
import { calculateStatisticalBounds, detectGameRegime } from '../mathService';
import { extractFeatures, extractDrawNumbers } from './featureExtractor';
import { computeAdvancedMetrics } from './advancedMetricsCalculator';
import { algorithmRegistry, type AlgorithmContext } from './algorithmRegistry';
import { deriveSeedFromHistory } from '../../utils/deterministicSeed';
import { LCG } from '../../utils/mathUtils';
import {
  normalizeWeights,
  getDefaultWeights,
  evaluateAlgoEmpiricalProof,
  computeEmpiricalBayesProofCredibility,
  type AlgoProofMetric,
} from './weightsManager';
import {
  projectWeightsWithContinuousProofShrinkage,
  type ClosedLoopAutopsyReport,
  type BatchClosedLoopAutopsyResult,
} from './closedLoopAutopsyService';
import {
  computeJointChannelAblationMatrix,
  type JointChannelEpistasisMatrix,
} from './channelAttributionService';
import { computeDrawCriticalThreshold } from './dnaAuditService';
import {
  computeModelDnaFingerprint,
  getModelDnaHistory,
  type ModelDnaRecord,
} from './modelDnaKnowledgeBase';
import {
  calculateDnaPerformanceDrift,
  type DnaPerformanceDriftReport,
} from './dnaAuditLogService';
import type { GenomicAuditReport } from '../training/genomicAuditService';
import { applyOptimizedWeights, calculateWeightDriftMetrics } from './optimizationController';
import {
  computeEpigenomeMatrixHpc,
  computeSequenceOrderMetricsHpc,
  scoreEpigenomeWalkForwardStepHpc,
  calibrateScoresSoftmaxMarginals,
  computeHedgeFixedShareStepHpc,
} from '../wasm/lotoEngineBridge';
import {
  conformalInterval,
  coverageFromSampleSize,
  computeEce,
  looEceAfterCalibration,
  type ConformalInterval,
  type CalibrationPairs,
} from './onlineCalibrationService';

export type ChromosomalArm =
  | 'STOCHASTIC_INFERENCE'
  | 'TEMPORAL_CADENCE'
  | 'SPECTRAL_FRACTAL'
  | 'TOPOLOGICAL_TRANSFER';

export type GeneExpressionState =
  | 'DOMINANT'
  | 'CO_EXPRESSIVE'
  | 'HOMEOSTATIC'
  | 'REPRESSED'
  | 'SILENCED';

export interface DnaGeneNode {
  rank: number;
  previousRank: number;
  rankShift: number; // previousRank - rank (positif = promotion dans la séquence)
  key: AlgoKey;
  label: string;
  chromosomalArm: ChromosomalArm;
  initialWeight: number;
  targetWeight: number;
  optimizedWeight: number;
  weightDelta: number;
  postMortemSignal: number; // Signal composite [-1, +1] issu des analyses post-mortem & autres
  forensicComponent: number;
  autopsyComponent: number;
  genomicComponent: number;
  driftComponent: number;
  epistaticSynergy: number; // Contribution épistasique des gènes partenaires [-1, +1]
  stabilityScore: number; // [0, 1] stabilité inter-générationnelle
  proofZScore: number;
  qValue: number;
  hasEmpiricalProof: boolean;
  expressionState: GeneExpressionState;
  rationale: string;
}

export interface EpistaticCoupling {
  geneA: AlgoKey;
  geneB: AlgoKey;
  labelA: string;
  labelB: string;
  couplingStrength: number; // [-1, +1] : >0 synergie co-active, <0 redondance/antagonisme
  classification: 'SYNERGISTIC_AMPLIFIER' | 'REDUNDANT_ANTAGONIST' | 'NEUTRAL';
  evidenceSources: number;
}

export interface DnaGeneCodon {
  id: string;
  genes: AlgoKey[];
  labels: string[];
  arm: ChromosomalArm;
  cohesionScore: number; // [0, 100]
  combinedWeight: number; // Somme des poids dans le génome optimisé
  synergyLift: number; // Épistasie moyenne du codon
  description: string;
}

export interface DnaGeneSequenceMetrics {
  kendallTauShiftVsActive: number; // Distance normalisée [0, 1] entre séquence active et optimisée
  kendallTauShiftVsCanonical: number; // Distance normalisée [0, 1] vs ordre canonique
  spearmanFootruleNormalized: number; // [0, 1]
  shannonWeightDiversity: number; // Entropie normalisée des poids [0, 1]
  epistaticCoherenceScore: number; // [0, 100]
  armDistribution: Record<ChromosomalArm, { weightShare: number; geneCount: number; meanSignal: number }>;
  armBalanceEntropy: number; // [0, 1]
  maxWeightDelta: number;
  criticalThreshold: number;
  isCriticalDrift: boolean;
  wasDamped: boolean;
  dampingFactor: number;
  sequenceSignature: string; // Ex: SEQ-[BAY>GAPS>SPC>...]-FINGERPRINT
}

export interface DnaGeneSynthesisInput {
  drawName: string;
  history: DrawResult[];
  currentWeights: AlgoWeights;
  forensicReports?: ForensicReport[];
  autopsyReports?: ClosedLoopAutopsyReport[];
  batchAutopsy?: BatchClosedLoopAutopsyResult | null;
  genomicAudit?: GenomicAuditReport | null;
  dnaDriftReport?: DnaPerformanceDriftReport | null;
  dnaLineage?: ModelDnaRecord[];
  jointEpistasis?: JointChannelEpistasisMatrix | null;
  proofMapOverride?: Record<AlgoKey, AlgoProofMetric>;
  /** Permet de désactiver la garde de seuil critique si explicitement autorisé */
  allowCriticalDrift?: boolean;
}

export interface DnaGeneSynthesisResult {
  drawName: string;
  computedAt: string;
  sequenceFingerprint: string;
  sourcesUsed: {
    historyDraws: number;
    forensicReports: number;
    autopsyReports: number;
    genomicGenesEvaluated: number;
    dnaLineageGenerations: number;
    hasDnaDriftReport: boolean;
  };
  sourceWeightsUsed: {
    forensic: number;
    autopsy: number;
    genomic: number;
    drift: number;
  };
  regimeContext: {
    regime: string;
    hurst: number;
    entropy: number;
    variance: number;
  };
  geneSequence: DnaGeneNode[];
  epistaticCouplings: EpistaticCoupling[];
  codons: DnaGeneCodon[];
  sequenceMetrics: DnaGeneSequenceMetrics;
  initialWeights: AlgoWeights;
  optimizedWeights: AlgoWeights;
  auditTrail: string[];
}

export const CHROMOSOMAL_ARM_LABELS: Record<ChromosomalArm, string> = {
  STOCHASTIC_INFERENCE: 'Inférence Stochastique & Graphes',
  TEMPORAL_CADENCE: 'Dynamique des Écarts & Cadences',
  SPECTRAL_FRACTAL: 'Spectre Fourier, Fractales & Ondes',
  TOPOLOGICAL_TRANSFER: 'Topologie Spatiale & Transferts',
};

const ARM_BY_GENE: Record<AlgoKey, ChromosomalArm> = {
  [AlgoKey.BAYES]: 'STOCHASTIC_INFERENCE',
  [AlgoKey.MARKOV]: 'STOCHASTIC_INFERENCE',
  [AlgoKey.JACCARD]: 'STOCHASTIC_INFERENCE',
  [AlgoKey.NETWORK_CORRELATION]: 'STOCHASTIC_INFERENCE',

  [AlgoKey.GAPS]: 'TEMPORAL_CADENCE',
  [AlgoKey.GAP_CADENCE]: 'TEMPORAL_CADENCE',
  [AlgoKey.GAP_TREND]: 'TEMPORAL_CADENCE',
  [AlgoKey.GAP_BAND_SEQUENCE]: 'TEMPORAL_CADENCE',
  [AlgoKey.GAP_PATTERN]: 'TEMPORAL_CADENCE',
  [AlgoKey.GAP_SEQUENCE]: 'TEMPORAL_CADENCE',
  [AlgoKey.TEMPORAL]: 'TEMPORAL_CADENCE',

  [AlgoKey.SPECTRAL]: 'SPECTRAL_FRACTAL',
  [AlgoKey.FRACTAL]: 'SPECTRAL_FRACTAL',
  [AlgoKey.ECHO_STATE]: 'SPECTRAL_FRACTAL',
  [AlgoKey.INTER_MONTHLY_RESONANCE]: 'SPECTRAL_FRACTAL',
  [AlgoKey.SEQUENCE_PATTERN]: 'SPECTRAL_FRACTAL',

  [AlgoKey.FREQUENCY]: 'TOPOLOGICAL_TRANSFER',
  [AlgoKey.MOMENTUM]: 'TOPOLOGICAL_TRANSFER',
  [AlgoKey.AFFINITY]: 'TOPOLOGICAL_TRANSFER',
  [AlgoKey.SPATIAL]: 'TOPOLOGICAL_TRANSFER',
  [AlgoKey.SHADOW_PROBABILITY]: 'TOPOLOGICAL_TRANSFER',
  [AlgoKey.DERIVED_NEIGHBOR]: 'TOPOLOGICAL_TRANSFER',
  [AlgoKey.ISOLATION_ANOMALY]: 'TOPOLOGICAL_TRANSFER',
  [AlgoKey.INTER_DRAW_RESONANCE]: 'TOPOLOGICAL_TRANSFER',
  [AlgoKey.MACHINE_TRANSFER]: 'TOPOLOGICAL_TRANSFER',
};

export function getChromosomalArm(key: AlgoKey): ChromosomalArm {
  return ARM_BY_GENE[key] ?? 'STOCHASTIC_INFERENCE';
}

/**
 * Encode deux séquences d'AlgoKey en indices entiers déterministes pour le noyau HPC O(K²).
 */
function encodeSequencesForHpc(seqA: AlgoKey[], seqB: AlgoKey[]): { a: Uint32Array; b: Uint32Array } {
  const indexMap = new Map<AlgoKey, number>();
  let nextId = 1;
  for (const k of seqA) {
    if (!indexMap.has(k)) indexMap.set(k, nextId++);
  }
  for (const k of seqB) {
    if (!indexMap.has(k)) indexMap.set(k, nextId++);
  }
  return {
    a: Uint32Array.from(seqA.map((k) => indexMap.get(k)!)),
    b: Uint32Array.from(seqB.map((k) => indexMap.get(k)!)),
  };
}

/**
 * Calcule la distance de Kendall-Tau normalisée [0, 1] entre deux séquences ordonnées d'AlgoKey.
 * 0 = ordre strictement identique ; 1 = ordre totalement inversé.
 */
export function computeNormalizedKendallTauDistance(
  seqA: AlgoKey[],
  seqB: AlgoKey[]
): number {
  const { a, b } = encodeSequencesForHpc(seqA, seqB);
  return computeSequenceOrderMetricsHpc(a, b).kendallTau;
}

/**
 * Calcule la distance de Spearman Footrule normalisée [0, 1] entre deux ordres de gènes.
 */
export function computeNormalizedSpearmanFootrule(
  seqA: AlgoKey[],
  seqB: AlgoKey[]
): number {
  const { a, b } = encodeSequencesForHpc(seqA, seqB);
  return computeSequenceOrderMetricsHpc(a, b).spearmanFootrule;
}

/**
 * Génère une signature déterministe lisible de séquence génomique (ex: SEQ-[BAY>GAP>SPC>FRQ>MRK]-dna_...).
 */
function buildSequenceSignature(
  orderedKeys: AlgoKey[],
  fingerprint: string
): string {
  const shortCode = (k: AlgoKey): string =>
    k
      .split('_')
      .map((part) => part.slice(0, 2).toUpperCase())
      .join('')
      .slice(0, 4);
  const head = orderedKeys.slice(0, 5).map(shortCode).join('>');
  return `SEQ-[${head}]-${fingerprint.slice(0, 10)}`;
}

/**
 * Approximation rationnelle d'Acklam (2003) pour Φ^{-1}(p) (précision < 1.15e-9).
 * Constantes mathématiques publiées (aucun seuil arbitraire).
 */
function acklamInvNormal(p: number): number {
  const clamped = Math.max(1e-12, Math.min(1 - 1e-12, p));
  const a1 = -3.969683028665376e1;
  const a2 = 2.209460984245205e2;
  const a3 = -2.759285104469687e2;
  const a4 = 1.38357751867269e2;
  const a5 = -3.066479806614716e1;
  const a6 = 2.506628277459239;

  const b1 = -5.447609879822406e1;
  const b2 = 1.615858368580409e2;
  const b3 = -1.556989798598866e2;
  const b4 = 6.680131188771972e1;
  const b5 = -1.328068155288572e1;

  const c1 = -7.784894002430293e-3;
  const c2 = -3.223964580411365e-1;
  const c3 = -2.400758277161838;
  const c4 = -2.549732539343734;
  const c5 = 4.374664141464968;
  const c6 = 2.938163982698783;

  const d1 = 7.784695709041462e-3;
  const d2 = 3.224671290700398e-1;
  const d3 = 2.445134137142996;
  const d4 = 3.754408661907416;

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  if (clamped < pLow) {
    const q = Math.sqrt(-2 * Math.log(clamped));
    return (
      (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    );
  }
  if (clamped <= pHigh) {
    const q = clamped - 0.5;
    const r = q * q;
    return (
      ((((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q) /
      (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - clamped));
  return -(
    (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
    ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
  );
}

/**
 * Fusion par précision inverse (variance minimale de Ledoit-Wolf + erreur-type bootstrap
 * circulaire par blocs) sur les vecteurs de signaux disponibles, sans constantes arbitraires.
 */
function computePrecisionSourceWeights(
  activeSources: Array<{
    id: 'forensic' | 'autopsy' | 'genomic' | 'drift';
    active: boolean;
    signals: number[];
    evidenceCount: number;
  }>
): { forensic: number; autopsy: number; genomic: number; drift: number } {
  const res = { forensic: 0, autopsy: 0, genomic: 0, drift: 0 };
  const enabled = activeSources.filter((s) => s.active && s.signals.length > 1);
  if (enabled.length === 0) return res;

  const targetPrior = 1.0 / enabled.length;
  const rawPrecision: number[] = [];
  let sumVars = 0;

  const vars = enabled.map((src) => {
    const n = src.signals.length;
    const mean = src.signals.reduce((a, b) => a + b, 0) / n;
    const obsVar = src.signals.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / n;

    // Bootstrap circulaire par blocs déterministe pour estimer la variance de dispersion
    const blockLen = Math.max(2, Math.floor(Math.cbrt(n)));
    const numBlocks = Math.ceil(n / blockLen);
    const blockMeans: number[] = [];
    for (let start = 0; start < n; start++) {
      let bSum = 0;
      for (let off = 0; off < blockLen; off++) {
        const val = src.signals[(start + off) % n];
        bSum += (val - mean) * (val - mean);
      }
      blockMeans.push(bSum / blockLen);
    }
    const meanB = blockMeans.reduce((a, b) => a + b, 0) / Math.max(1, blockMeans.length);
    const varB =
      blockMeans.reduce((acc, b) => acc + (b - meanB) * (b - meanB), 0) /
      Math.max(1, blockMeans.length * numBlocks);

    return { obsVar, varB, evidence: Math.max(1, src.evidenceCount) };
  });

  vars.forEach((v) => {
    sumVars += v.obsVar;
  });
  const priorVar = Math.max(1.0 / Math.max(1, enabled[0].signals.length ** 2), sumVars / enabled.length);

  enabled.forEach((_, idx) => {
    const { obsVar, varB, evidence } = vars[idx];
    // Rétrécissement Ledoit-Wolf analytique vers la variance moyenne inter-sources
    const lwLambda =
      obsVar + varB > 0 ? Math.min(1, varB / (obsVar + varB + 1.0 / evidence)) : 1;
    const shrunkVar = (1 - lwLambda) * obsVar + lwLambda * priorVar;
    const prec =
      (Math.log1p(evidence) * (1.0 + Math.sqrt(obsVar))) /
      Math.max(1e-6, shrunkVar + varB);
    rawPrecision.push(prec);
  });

  const sumPrec = rawPrecision.reduce((a, b) => a + b, 0);
  if (sumPrec <= 0) {
    enabled.forEach((s) => {
      res[s.id] = targetPrior;
    });
    return res;
  }

  enabled.forEach((s, idx) => {
    res[s.id] = rawPrecision[idx] / sumPrec;
  });
  return res;
}

/**
 * SÉQUENCEUR ÉPISTASIQUE & RÉGULATEUR DE POIDS GÉNOMIQUES (EpiGenome-SQ)
 *
 * Algorithme personnalisé dédié à la gestion conjointe :
 * 1. Des SÉQUENCES DE GÈNES ADN (ordonnancement chromosomique par bras fonctionnels,
 *    couplage épistasique K×K non biaisé CLR + ablation conjointe, découverte de codons).
 * 2. Des POIDS GÉNOMIQUES calibrés multi-sources par précision inverse :
 *    - Analyses post-mortem (`ForensicReport` : ajustements, contrefactuels, dérive, XAP CLR)
 *    - Autopsies en boucle fermée & attribution contrefactuelle (`ClosedLoopAutopsyReport`)
 *    - Audits génomiques walk-forward (`GenomicAuditReport`)
 *    - Dérive ADN post-tirage (`DnaPerformanceDriftReport`)
 *    - Rétrécissement Empirical-Bayes continu (`projectWeightsWithContinuousProofShrinkage`)
 */
export function synthesizeDnaGeneSequenceAndWeights(
  input: DnaGeneSynthesisInput
): DnaGeneSynthesisResult {
  const {
    drawName,
    history: rawHistory,
    currentWeights,
    forensicReports = [],
    autopsyReports = [],
    batchAutopsy = null,
    genomicAudit = null,
    dnaDriftReport = null,
    dnaLineage = [],
    jointEpistasis = null,
    proofMapOverride,
    allowCriticalDrift = false,
  } = input;

  const pureHistory = purifyHistoryForDraw(drawName, rawHistory || []);
  const hasMachine = drawHasMachineNumbers(drawName, pureHistory);
  const validKeys = Object.values(AlgoKey);
  const K = validKeys.length;

  // 1. Poids initiaux nettoyés et normalisés (zéro canaux retirés / machine absente)
  const rawInitCopy: AlgoWeights = {
    ...getDefaultWeights(),
    ...(currentWeights || {}),
  };
  if (!hasMachine) {
    rawInitCopy[AlgoKey.MACHINE_TRANSFER] = 0;
  }
  const initialWeights = normalizeWeights(rawInitCopy);

  // 2. Régime stochastique réel et preuve empirique (rang Mann-Whitney + Westfall-Young max-T)
  const bounds = calculateStatisticalBounds(pureHistory);
  const regimeInfo = detectGameRegime(pureHistory);
  const proofMap = proofMapOverride ?? evaluateAlgoEmpiricalProof(drawName, pureHistory);

  const forcedZeroKeys = new Set<AlgoKey>();
  validKeys.forEach((k) => {
    if (RETIRED_ALGO_WEIGHT_KEYS.has(k) || (k === AlgoKey.MACHINE_TRANSFER && !hasMachine)) {
      forcedZeroKeys.add(k);
    }
  });
  const activeCount = Math.max(1, K - forcedZeroKeys.size);

  // 3. Garde anti-fuite causale sur les rapports post-mortem (date, dataCutoff, computedAt <= cutoff)
  const causalCutoff =
    pureHistory.length > 0
      ? Math.max(
          ...pureHistory.map((d) => {
            const ts = parseDateSafely(d.date).getTime();
            return Number.isFinite(ts) ? ts : 0;
          })
        )
      : Number.POSITIVE_INFINITY;

  const usableForensics = [...forensicReports]
    .filter((r) => {
      if (!r || r.drawName?.trim().toLowerCase() !== drawName.trim().toLowerCase()) {
        return false;
      }
      if (pureHistory.length > 0 && causalCutoff > 0 && Number.isFinite(causalCutoff)) {
        if (r.date) {
          const repTs = parseDateSafely(r.date).getTime();
          if (Number.isFinite(repTs) && repTs > causalCutoff) return false;
        }
        if (r.dataCutoff) {
          const cutTs = parseDateSafely(r.dataCutoff).getTime();
          if (Number.isFinite(cutTs) && cutTs > causalCutoff) return false;
        }
        if (r.computedAt) {
          const compTs = new Date(r.computedAt).getTime();
          if (Number.isFinite(compTs) && compTs > causalCutoff) return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      const tA = a.timestamp ? new Date(a.timestamp).getTime() : parseDateSafely(a.date).getTime();
      const tB = b.timestamp ? new Date(b.timestamp).getTime() : parseDateSafely(b.date).getTime();
      return (Number.isFinite(tB) ? tB : 0) - (Number.isFinite(tA) ? tA : 0);
    });

  // 4. Agrégation continue des signaux par gène depuis les 4 sources d'analyse
  const forensicAcc: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const forensicW: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const autopsyAcc: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const autopsyW: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const genomicAcc: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const driftAcc: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;

  validKeys.forEach((k) => {
    forensicAcc[k] = 0;
    forensicW[k] = 0;
    autopsyAcc[k] = 0;
    autopsyW[k] = 0;
    genomicAcc[k] = 0;
    driftAcc[k] = 0;
  });

  // 4.a Accumulation des rapports Post-Mortem Forensics
  const R = usableForensics.length;
  const tauR = Math.max(1, Math.sqrt(Math.max(1, R)));
  const maxKL = Math.log(90);

  const keyToIdx = new Map<AlgoKey, number>();
  validKeys.forEach((k, idx) => keyToIdx.set(k, idx));
  const rawEpistasis = Array.from({ length: K }, () => new Float64Array(K));
  const epistasisSamples = Array.from({ length: K }, () => new Float64Array(K));

  // Indices actifs (non forcés à zéro) pour transformation CLR sans effet de clôture
  const activeIndices: number[] = [];
  validKeys.forEach((k, i) => {
    if (!forcedZeroKeys.has(k)) activeIndices.push(i);
  });
  const mActive = activeIndices.length;

  usableForensics.forEach((rep, idx) => {
    const recencyWeight = Math.exp(-idx / tauR);
    const klPenalty =
      rep.kl_divergence && Number.isFinite(rep.kl_divergence)
        ? Math.exp(-Math.max(0, rep.kl_divergence) / maxKL)
        : 1.0;
    const blackSwanFactor = rep.isBlackSwan ? 0.5 : 1.0;
    const wRep = recencyWeight * klPenalty * blackSwanFactor;

    if (Array.isArray(rep.proposedAdjustments)) {
      rep.proposedAdjustments.forEach((adj) => {
        const k = adj.algo as AlgoKey;
        if (keyToIdx.has(k) && Number.isFinite(adj.proposedWeightChange)) {
          forensicAcc[k] += Math.tanh(adj.proposedWeightChange * activeCount) * wRep;
          forensicW[k] += wRep;
        }
      });
    }

    if (Array.isArray(rep.algorithmicDrift)) {
      rep.algorithmicDrift.forEach((drift) => {
        const k = drift.algo as AlgoKey;
        if (keyToIdx.has(k) && Number.isFinite(drift.driftScore)) {
          const dir = drift.direction === 'underestimating' ? 1.0 : -1.0;
          forensicAcc[k] += dir * Math.tanh(drift.driftScore) * wRep;
          forensicW[k] += wRep;
        }
      });
    }

    if (Array.isArray(rep.counterfactuals)) {
      rep.counterfactuals.forEach((cf) => {
        if (cf.action === 'OPTIMAL_DNA' && cf.optimalWeightsDistribution) {
          validKeys.forEach((k) => {
            const optW = cf.optimalWeightsDistribution?.[k];
            const curW = initialWeights[k] || 1 / activeCount;
            if (typeof optW === 'number' && Number.isFinite(optW)) {
              const relDiff = (optW - curW) / Math.max(1 / (2 * activeCount), curW);
              forensicAcc[k] += Math.tanh(relDiff) * wRep;
              forensicW[k] += wRep;
            }
          });
        } else if (cf.action === 'SYNERGY' && cf.algo) {
          const parts = cf.algo
            .split('+')
            .map((s) => s.trim() as AlgoKey)
            .filter((s) => keyToIdx.has(s));
          const gain = Math.tanh((cf.rankImprovement || 0) / Math.max(1, R));
          parts.forEach((k) => {
            forensicAcc[k] += gain * wRep;
            forensicW[k] += wRep;
          });
          for (let a = 0; a < parts.length; a++) {
            for (let b = a + 1; b < parts.length; b++) {
              const ia = keyToIdx.get(parts[a])!;
              const ib = keyToIdx.get(parts[b])!;
              const synVal =
                Math.tanh((cf.rankImprovement || 1) / Math.max(1, activeIndices.length / 5)) * wRep;
              rawEpistasis[ia][ib] += synVal;
              rawEpistasis[ib][ia] += synVal;
              epistasisSamples[ia][ib] += wRep;
              epistasisSamples[ib][ia] += wRep;
            }
          }
        } else if (cf.algo && keyToIdx.has(cf.algo as AlgoKey)) {
          const k = cf.algo as AlgoKey;
          const sign = cf.action === 'BOOST' || cf.action === 'ISOLATE' ? 1.0 : -1.0;
          const mag = Math.tanh(Math.abs(cf.rankImprovement || 0) / Math.max(1, R + 1));
          forensicAcc[k] += sign * mag * wRep;
          forensicW[k] += wRep;
        }
      });
    }

    // iv. Winning XAP composition : Transformation Log-Ratio Centrée (CLR) d'Aitchison
    // + soustraction analytique exacte de l'espérance nulle par permutation :
    // E_perm[z_i * z_j | Σz=0] = -Σ z_a^2 / (m*(m-1)), éliminant l'artéfact de clôture.
    if (Array.isArray(rep.winningXAP) && rep.winningXAP.length > 0 && mActive >= 2) {
      const meanVec = new Float64Array(K);
      let validXapCount = 0;
      const epsFloor = 1.0 / (mActive * mActive);

      rep.winningXAP.forEach((xap) => {
        const vec = xap?.shapleyValues || xap?.dnaVector;
        if (!vec) return;
        let rowSum = 0;
        activeIndices.forEach((idxActive) => {
          const k = validKeys[idxActive];
          const v = Math.max(0, Number((vec as Record<string, number>)[k]) || 0);
          rowSum += v;
        });
        if (rowSum <= 0) return;
        validXapCount++;

        const pVec = new Float64Array(mActive);
        const logP = new Float64Array(mActive);
        let denom = 0;
        activeIndices.forEach((idxActive, pos) => {
          const k = validKeys[idxActive];
          const raw = Math.max(0, Number((vec as Record<string, number>)[k]) || 0);
          pVec[pos] = raw + epsFloor;
          denom += pVec[pos];
        });
        let meanLog = 0;
        for (let pos = 0; pos < mActive; pos++) {
          const normP = pVec[pos] / denom;
          meanVec[activeIndices[pos]] += normP;
          logP[pos] = Math.log(normP);
          meanLog += logP[pos];
        }
        meanLog /= mActive;

        const clr = new Float64Array(mActive);
        let sumSqClr = 0;
        for (let pos = 0; pos < mActive; pos++) {
          clr[pos] = logP[pos] - meanLog;
          sumSqClr += clr[pos] * clr[pos];
        }
        if (sumSqClr <= 1e-12) return;

        const meanSqClr = sumSqClr / mActive;
        const permNullExpectedProd = -sumSqClr / (mActive * (mActive - 1));

        for (let a = 0; a < mActive; a++) {
          const ia = activeIndices[a];
          for (let b = a + 1; b < mActive; b++) {
            const ib = activeIndices[b];
            const debiasedProd = (clr[a] * clr[b] - permNullExpectedProd) / meanSqClr;
            const contrib = Math.tanh(debiasedProd) * wRep;
            rawEpistasis[ia][ib] += contrib;
            rawEpistasis[ib][ia] += contrib;
            epistasisSamples[ia][ib] += wRep;
            epistasisSamples[ib][ia] += wRep;
          }
        }
      });

      if (validXapCount > 0) {
        validKeys.forEach((k, i) => {
          const empiricalShare = meanVec[i] / validXapCount;
          const diff = (empiricalShare - initialWeights[k]) * activeCount;
          forensicAcc[k] += Math.tanh(diff) * wRep;
          forensicW[k] += wRep;
        });
      }
    }
  });

  // 4.b Accumulation des Autopsies en Boucle Fermée + Attribution Contrefactuelle Conjointe I(i,j)
  const combinedAutopsies: ClosedLoopAutopsyReport[] = [
    ...autopsyReports,
    ...(batchAutopsy?.reports || []),
  ].filter(
    (r) => !r.drawName || r.drawName.trim().toLowerCase() === drawName.trim().toLowerCase()
  );

  const tauA = Math.max(1, Math.sqrt(Math.max(1, combinedAutopsies.length)));
  const brierUniformScale = 1.0 / ((5.0 / 90.0) * (85.0 / 90.0));
  combinedAutopsies.forEach((aut, idx) => {
    const wAut = Math.exp(-idx / tauA);
    if (Array.isArray(aut.algoGradients)) {
      aut.algoGradients.forEach((g) => {
        if (!keyToIdx.has(g.key)) return;
        const gradDrive = Math.tanh(-g.gradient * 2.0 + (g.attributionToWinners - 1 / activeCount) * activeCount);
        autopsyAcc[g.key] += gradDrive * wAut;
        autopsyW[g.key] += wAut;
      });
    }
    if (Array.isArray(aut.channelAttribution)) {
      aut.channelAttribution.forEach((attr) => {
        const k = attr.key as AlgoKey;
        if (!keyToIdx.has(k)) return;
        const causalGain = Math.tanh(
          attr.deltaHitsTop5Ablation - attr.deltaBrierAblation * brierUniformScale
        );
        autopsyAcc[k] += causalGain * wAut;
        autopsyW[k] += wAut;
      });
    }
  });

  if (batchAutopsy?.aggregatedChannelAttribution && combinedAutopsies.length === 0) {
    batchAutopsy.aggregatedChannelAttribution.forEach((attr) => {
      const k = attr.key as AlgoKey;
      if (!keyToIdx.has(k)) return;
      const causalGain = Math.tanh(
        attr.meanDeltaHitsTop5Ablation - attr.meanDeltaBrierAblation * brierUniformScale
      );
      autopsyAcc[k] += causalGain;
      autopsyW[k] += 1;
    });
  }

  // Intégration directe de l'épistasie causale conjointe hors-échantillon I(i, j) = Δ(i,j) - Δ(i) - Δ(j)
  if (jointEpistasis && jointEpistasis.channelKeys.length > 0) {
    const jK = jointEpistasis.channelKeys.length;
    for (let i = 0; i < jK; i++) {
      const ia = keyToIdx.get(jointEpistasis.channelKeys[i] as AlgoKey);
      if (ia === undefined) continue;
      for (let j = i + 1; j < jK; j++) {
        const ib = keyToIdx.get(jointEpistasis.channelKeys[j] as AlgoKey);
        if (ib === undefined) continue;
        const val = jointEpistasis.interactionFlat[i * jK + j];
        if (Number.isFinite(val) && Math.abs(val) > 0) {
          rawEpistasis[ia][ib] += val;
          rawEpistasis[ib][ia] += val;
          epistasisSamples[ia][ib] += 1;
          epistasisSamples[ib][ia] += 1;
        }
      }
    }
  }

  // 4.c Audit Génomique (GenomicAuditReport)
  let genomicEvaluatedCount = 0;
  if (genomicAudit && Array.isArray(genomicAudit.allGenes)) {
    genomicEvaluatedCount = genomicAudit.allGenes.length;
    const meanResonance =
      genomicAudit.allGenes.reduce((s, g) => s + g.resonanceScore, 0) /
      Math.max(1, genomicAudit.allGenes.length);
    const stdResonance = Math.max(
      1,
      Math.sqrt(
        genomicAudit.allGenes.reduce(
          (s, g) => s + Math.pow(g.resonanceScore - meanResonance, 2),
          0
        ) / Math.max(1, genomicAudit.allGenes.length)
      )
    );
    const effValues = genomicAudit.allGenes.map((g) => g.informationEfficiency);
    const meanEff = effValues.reduce((a, b) => a + b, 0) / Math.max(1, effValues.length);
    const stdEff = Math.max(
      1e-3,
      Math.sqrt(
        effValues.reduce((s, e) => s + (e - meanEff) * (e - meanEff), 0) /
          Math.max(1, effValues.length)
      )
    );

    genomicAudit.allGenes.forEach((g) => {
      if (keyToIdx.has(g.key)) {
        const zRes = (g.resonanceScore - meanResonance) / stdResonance;
        const zEff = (g.informationEfficiency - meanEff) / stdEff;
        const invVarRes = 1.0 / (stdResonance * stdResonance);
        const invVarEff = 1.0 / (stdEff * stdEff);
        const combinedZ = (invVarRes * zRes + invVarEff * zEff) / (invVarRes + invVarEff);
        genomicAcc[g.key] = Math.tanh(combinedZ);
      }
    });
  }

  // 4.d Dérive ADN (DnaPerformanceDriftReport)
  if (dnaDriftReport && Array.isArray(dnaDriftReport.algorithmDriftBreakdown)) {
    dnaDriftReport.algorithmDriftBreakdown.forEach((item) => {
      const k = item.algoKey as AlgoKey;
      if (keyToIdx.has(k)) {
        const utilityGap = (item.empiricalUtility - item.injectedWeight) * activeCount;
        driftAcc[k] = Math.tanh(utilityGap);
      }
    });
  }

  // 4.e Lignée ADN (ModelDnaRecord[])
  const cleanLineage = dnaLineage.filter(
    (rec) => !rec.drawName || rec.drawName.trim().toLowerCase() === drawName.trim().toLowerCase()
  );
  const L = cleanLineage.length;
  const lineageWeightsFlat = new Float64Array(L * K);
  cleanLineage.forEach((rec, t) => {
    validKeys.forEach((k, g) => {
      const w = Number(rec.weights?.[k]);
      lineageWeightsFlat[t * K + g] = Number.isFinite(w) ? w : initialWeights[k];
    });
  });

  // 5 & 6. Fusion par précision inverse (zéro poids fixe) + noyau épistasique HPC
  const normalizedEntropy =
    bounds.shannonEntropy > 1.0
      ? Math.min(1.0, bounds.shannonEntropy / Math.log2(90))
      : Math.max(0, Math.min(1.0, bounds.shannonEntropy));

  const hasForensicSource = R > 0 && validKeys.some((k) => !forcedZeroKeys.has(k) && forensicW[k] > 0);
  const hasAutopsySource =
    (combinedAutopsies.length > 0 || Boolean(batchAutopsy)) &&
    validKeys.some((k) => !forcedZeroKeys.has(k) && autopsyW[k] > 0);
  const hasGenomicSource = genomicEvaluatedCount > 0;
  const hasDriftSource = Boolean(dnaDriftReport);

  const forensicCompByGene: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const autopsyCompByGene: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const genomicCompByGene: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const driftCompByGene: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;

  const forensicVec: number[] = [];
  const autopsyVec: number[] = [];
  const genomicVec: number[] = [];
  const driftVec: number[] = [];

  validKeys.forEach((k) => {
    if (forcedZeroKeys.has(k)) {
      forensicCompByGene[k] = 0;
      autopsyCompByGene[k] = 0;
      genomicCompByGene[k] = 0;
      driftCompByGene[k] = 0;
      return;
    }
    const fVal = forensicW[k] > 0 ? Math.tanh(forensicAcc[k] / forensicW[k]) : 0;
    const aVal = autopsyW[k] > 0 ? Math.tanh(autopsyAcc[k] / autopsyW[k]) : 0;
    const gVal = hasGenomicSource ? genomicAcc[k] : 0;
    const dVal = hasDriftSource ? driftAcc[k] : 0;

    forensicCompByGene[k] = fVal;
    autopsyCompByGene[k] = aVal;
    genomicCompByGene[k] = gVal;
    driftCompByGene[k] = dVal;

    forensicVec.push(fVal);
    autopsyVec.push(aVal);
    genomicVec.push(gVal);
    driftVec.push(dVal);
  });

  const sourceWeightsUsed = computePrecisionSourceWeights([
    { id: 'forensic', active: hasForensicSource, signals: forensicVec, evidenceCount: R },
    {
      id: 'autopsy',
      active: hasAutopsySource,
      signals: autopsyVec,
      evidenceCount: combinedAutopsies.length + (batchAutopsy ? 1 : 0),
    },
    {
      id: 'genomic',
      active: hasGenomicSource,
      signals: genomicVec,
      evidenceCount: Math.max(1, genomicAudit?.evaluatedDrawsCount || 1),
    },
    {
      id: 'drift',
      active: hasDriftSource,
      signals: driftVec,
      evidenceCount: Math.max(1, dnaDriftReport?.evaluatedDrawsCount || 1),
    },
  ]);

  const rawEpistasisFlat = new Float64Array(K * K);
  const epistasisSamplesFlat = new Float64Array(K * K);
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      rawEpistasisFlat[i * K + j] = rawEpistasis[i][j];
      epistasisSamplesFlat[i * K + j] = epistasisSamples[i][j];
    }
  }

  const initialWeightsFlat = new Float64Array(K);
  const armIds = new Uint8Array(K);
  const proofCredibilities = new Float64Array(K);
  const proofScores = new Float64Array(K);
  const baseAnalysisSignals = new Float64Array(K);
  const forcedZeroFlags = new Uint8Array(K);

  const ARM_TO_ID: Record<ChromosomalArm, number> = {
    STOCHASTIC_INFERENCE: 0,
    TEMPORAL_CADENCE: 1,
    SPECTRAL_FRACTAL: 2,
    TOPOLOGICAL_TRANSFER: 3,
  };

  validKeys.forEach((k, i) => {
    initialWeightsFlat[i] = initialWeights[k] ?? 0;
    armIds[i] = ARM_TO_ID[getChromosomalArm(k)] ?? 0;
    const proof = proofMap[k];
    proofCredibilities[i] = computeEmpiricalBayesProofCredibility(proof);
    proofScores[i] = proof ? proof.proofScore : 0;

    if (forcedZeroKeys.has(k)) {
      forcedZeroFlags[i] = 1;
      baseAnalysisSignals[i] = 0;
      return;
    }

    let num = 0;
    let den = 0;
    if (sourceWeightsUsed.forensic > 0 && forensicW[k] > 0) {
      num += sourceWeightsUsed.forensic * forensicCompByGene[k];
      den += sourceWeightsUsed.forensic;
    }
    if (sourceWeightsUsed.autopsy > 0 && autopsyW[k] > 0) {
      num += sourceWeightsUsed.autopsy * autopsyCompByGene[k];
      den += sourceWeightsUsed.autopsy;
    }
    if (sourceWeightsUsed.genomic > 0) {
      num += sourceWeightsUsed.genomic * genomicCompByGene[k];
      den += sourceWeightsUsed.genomic;
    }
    if (sourceWeightsUsed.drift > 0) {
      num += sourceWeightsUsed.drift * driftCompByGene[k];
      den += sourceWeightsUsed.drift;
    }
    baseAnalysisSignals[i] = den > 0 ? num / den : 0;
  });

  const totalEvidenceUnits =
    R + combinedAutopsies.length + (genomicEvaluatedCount > 0 ? 1 : 0) + (dnaDriftReport ? 1 : 0);

  const hpcMatrixRes = computeEpigenomeMatrixHpc({
    rawEpistasisFlat,
    epistasisSamplesFlat,
    lineageWeightsFlat,
    numLineage: L,
    initialWeights: initialWeightsFlat,
    armIds,
    proofCredibilities,
    proofScores,
    baseAnalysisSignals,
    forcedZeroFlags,
    numGenes: K,
    hurst: bounds.hurstExponent,
    entropyNorm: normalizedEntropy,
    totalEvidenceUnits,
  });

  const geneStability: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const postMortemSignalByGene: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const epistaticSynergyByGene: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const rawTargetWeights: Record<string, number> = {};

  const epistaticMatrix: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
  const nonZeroCouplings: Array<{
    i: number;
    j: number;
    clamped: number;
    samples: number;
  }> = [];

  for (let i = 0; i < K; i++) {
    const k = validKeys[i];
    geneStability[k] = hpcMatrixRes.geneStability[i] ?? 1.0;
    epistaticSynergyByGene[k] = hpcMatrixRes.epistaticSynergy[i] ?? 0;
    postMortemSignalByGene[k] = hpcMatrixRes.postMortemSignal[i] ?? 0;
    rawTargetWeights[k] = hpcMatrixRes.rawTargetWeights[i] ?? 0;

    for (let j = i + 1; j < K; j++) {
      const clamped = hpcMatrixRes.epistaticMatrixFlat[i * K + j] ?? 0;
      const samples = hpcMatrixRes.evidenceSamplesFlat[i * K + j] ?? 0;
      epistaticMatrix[i][j] = clamped;
      epistaticMatrix[j][i] = clamped;
      if (samples > 0) {
        nonZeroCouplings.push({ i, j, clamped, samples });
      }
    }
  }

  // Seuil de classification épistasique dérivé de l'écart-type observé et du quantile normal (z_{1-5/90})
  const zCutoff = acklamInvNormal(1.0 - 5.0 / 90.0);
  const epiMeanSq =
    nonZeroCouplings.length > 0
      ? nonZeroCouplings.reduce((acc, c) => acc + c.clamped * c.clamped, 0) / nonZeroCouplings.length
      : 1.0 / activeCount;
  const epiRms = Math.sqrt(Math.max(1.0 / (activeCount * activeCount), epiMeanSq));
  const epiClassThreshold = Math.min(1.0 / Math.sqrt(activeCount), epiRms * (zCutoff / Math.SQRT2));

  const epistaticCouplings: EpistaticCoupling[] = nonZeroCouplings.map(({ i, j, clamped, samples }) => {
    const gA = validKeys[i];
    const gB = validKeys[j];
    let classification: EpistaticCoupling['classification'] = 'NEUTRAL';
    if (clamped >= epiClassThreshold) classification = 'SYNERGISTIC_AMPLIFIER';
    else if (clamped <= -epiClassThreshold) classification = 'REDUNDANT_ANTAGONIST';

    return {
      geneA: gA,
      geneB: gB,
      labelA: LABELS_MAP[gA] || gA,
      labelB: LABELS_MAP[gB] || gB,
      couplingStrength: parseFloat(clamped.toFixed(4)),
      classification,
      evidenceSources: parseFloat(samples.toFixed(2)),
    };
  });

  epistaticCouplings.sort((a, b) => Math.abs(b.couplingStrength) - Math.abs(a.couplingStrength));

  // Projection continue sur le simplexe avec rétrécissement Empirical-Bayes (zéro verrou binaire)
  const candidateWeights = projectWeightsWithContinuousProofShrinkage(
    rawTargetWeights,
    initialWeights,
    proofMap,
    forcedZeroKeys
  );

  // 9. Vérification & amortissement continu du seuil critique de dérive
  const { criticalThreshold } = computeDrawCriticalThreshold(
    pureHistory,
    activeCount,
    bounds.hurstExponent
  );

  const { maxDelta } = calculateWeightDriftMetrics(initialWeights, candidateWeights);
  const isCriticalDrift = maxDelta > criticalThreshold;

  let optimizedWeights = candidateWeights;
  let wasDamped = false;
  let dampingFactor = 1.0;

  if (isCriticalDrift && !allowCriticalDrift) {
    dampingFactor = criticalThreshold / Math.max(criticalThreshold, maxDelta);
    wasDamped = true;
    const dampedRaw: Record<string, number> = {};
    validKeys.forEach((k) => {
      if (forcedZeroKeys.has(k)) {
        dampedRaw[k] = 0;
        return;
      }
      const cur = initialWeights[k] ?? 0;
      const tgt = candidateWeights[k] ?? 0;
      dampedRaw[k] = cur + dampingFactor * (tgt - cur);
    });
    optimizedWeights = projectWeightsWithContinuousProofShrinkage(
      dampedRaw,
      initialWeights,
      proofMap,
      forcedZeroKeys
    );
  }

  // 10. Construction de la Séquence Chromosomique Ordonnée des Gènes (zéro constante magique)
  const activeSequenceOrder = [...validKeys].sort((a, b) => {
    const diff = (initialWeights[b] || 0) - (initialWeights[a] || 0);
    return Math.abs(diff) > 1e-9 ? diff : a.localeCompare(b);
  });
  const canonicalSequenceOrder = [...validKeys];

  const previousRankMap = new Map<AlgoKey, number>();
  activeSequenceOrder.forEach((k, idx) => previousRankMap.set(k, idx + 1));

  const geneExpressionScore = (k: AlgoKey): number => {
    if (forcedZeroKeys.has(k)) return -1e6;
    const optW = optimizedWeights[k] || 0;
    const proof = proofMap[k];
    const cred = computeEmpiricalBayesProofCredibility(proof);
    const pmScale = 1.0 / Math.sqrt(activeCount);
    return (
      optW * activeCount +
      pmScale * postMortemSignalByGene[k] +
      (pmScale / 2.0) * epistaticSynergyByGene[k] +
      pmScale * cred
    );
  };

  const optimizedSequenceOrder = [...validKeys].sort((a, b) => {
    const diff = geneExpressionScore(b) - geneExpressionScore(a);
    return Math.abs(diff) > 1e-9 ? diff : a.localeCompare(b);
  });

  const activeWeightsList = validKeys
    .filter((k) => !forcedZeroKeys.has(k))
    .map((k) => optimizedWeights[k] || 0);
  const meanOptW =
    activeWeightsList.reduce((a, b) => a + b, 0) / Math.max(1, activeWeightsList.length);
  const stdOptW = Math.sqrt(
    activeWeightsList.reduce((s, w) => s + (w - meanOptW) ** 2, 0) /
      Math.max(1, activeWeightsList.length)
  );

  // Seuils d'expression dérivés de z_{1-5/90} et de 1/sqrt(K_active)
  const dominantZGate = zCutoff / Math.SQRT2;
  const signalExprScale = 1.0 / Math.sqrt(activeCount);
  const topCodonRankLimit = Math.max(3, Math.round(Math.sqrt(activeCount)));

  const geneSequence: DnaGeneNode[] = optimizedSequenceOrder.map((k, idx) => {
    const rank = idx + 1;
    const previousRank = previousRankMap.get(k) ?? rank;
    const rankShift = previousRank - rank;
    const optW = optimizedWeights[k] ?? 0;
    const initW = initialWeights[k] ?? 0;
    const candW = candidateWeights[k] ?? initW;
    const proof = proofMap[k];
    const proofZScore = proof?.proofScore ?? 0;
    const qValue = proof?.qValue ?? 1.0;
    const hasEmpiricalProof = Boolean(proof && proof.hasProof && proof.proofScore > 0);
    const pmSignal = postMortemSignalByGene[k];
    const epSyn = epistaticSynergyByGene[k];

    let expressionState: GeneExpressionState = 'HOMEOSTATIC';
    if (forcedZeroKeys.has(k) || optW <= 1e-6) {
      expressionState = 'SILENCED';
    } else {
      const zW = stdOptW > 1e-7 ? (optW - meanOptW) / stdOptW : 0;
      if (zW > dominantZGate || (hasEmpiricalProof && rank <= topCodonRankLimit)) {
        expressionState = 'DOMINANT';
      } else if (pmSignal > signalExprScale || epSyn > signalExprScale) {
        expressionState = 'CO_EXPRESSIVE';
      } else if (zW < -dominantZGate || pmSignal < -signalExprScale) {
        expressionState = 'REPRESSED';
      }
    }

    const label = LABELS_MAP[k] || k;
    let rationale = `Équilibre homéostatique (poids ${(optW * 100).toFixed(2)}%).`;
    if (expressionState === 'SILENCED') {
      rationale = `Gène neutralisé (données machine absentes ou canal retiré).`;
    } else if (hasEmpiricalProof) {
      rationale = `Expression amplifiée avec preuve rang WY max-T (Z=${proofZScore.toFixed(2)}, q=${qValue.toFixed(3)}) et signal post-mortem ${(pmSignal * 100).toFixed(1)}%.`;
    } else if (pmSignal < -signalExprScale * 0.25) {
      rationale = `Amorti par rétroaction post-mortem (${(pmSignal * 100).toFixed(1)}%) ; rétrécissement Empirical-Bayes actif.`;
    } else if (epSyn > signalExprScale * 0.5) {
      rationale = `Maintenu en co-expression épistasique (+${(epSyn * 100).toFixed(1)}% synergie partenaire).`;
    }

    return {
      rank,
      previousRank,
      rankShift,
      key: k,
      label,
      chromosomalArm: getChromosomalArm(k),
      initialWeight: parseFloat(initW.toFixed(6)),
      targetWeight: parseFloat(candW.toFixed(6)),
      optimizedWeight: parseFloat(optW.toFixed(6)),
      weightDelta: parseFloat((optW - initW).toFixed(6)),
      postMortemSignal: parseFloat(pmSignal.toFixed(4)),
      forensicComponent: parseFloat(forensicCompByGene[k].toFixed(4)),
      autopsyComponent: parseFloat(autopsyCompByGene[k].toFixed(4)),
      genomicComponent: parseFloat(genomicCompByGene[k].toFixed(4)),
      driftComponent: parseFloat(driftCompByGene[k].toFixed(4)),
      epistaticSynergy: parseFloat(epSyn.toFixed(4)),
      stabilityScore: parseFloat((geneStability[k] ?? 1.0).toFixed(4)),
      proofZScore: parseFloat(proofZScore.toFixed(3)),
      qValue: parseFloat(qValue.toFixed(5)),
      hasEmpiricalProof,
      expressionState,
      rationale,
    };
  });

  // 11. Découverte des Codons Synergiques (paires/triplets co-exprimés sur le même bras ou inter-bras)
  const codonThreshold = 1.0 / (2.0 * Math.sqrt(activeCount));
  const codons: DnaGeneCodon[] = [];
  const synergisticPairs = epistaticCouplings
    .filter((c) => c.couplingStrength > codonThreshold)
    .slice(0, 6);

  synergisticPairs.forEach((pair, idx) => {
    const wA = optimizedWeights[pair.geneA] || 0;
    const wB = optimizedWeights[pair.geneB] || 0;
    const sigA = postMortemSignalByGene[pair.geneA] || 0;
    const sigB = postMortemSignalByGene[pair.geneB] || 0;
    const cohesion = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          100 * (0.5 * pair.couplingStrength + 0.5 * Math.max(0, (sigA + sigB + 2) / 4))
        )
      )
    );
    codons.push({
      id: `codon_pair_${idx + 1}_${pair.geneA}_${pair.geneB}`,
      genes: [pair.geneA, pair.geneB],
      labels: [pair.labelA, pair.labelB],
      arm: getChromosomalArm(pair.geneA),
      cohesionScore: cohesion,
      combinedWeight: parseFloat((wA + wB).toFixed(4)),
      synergyLift: pair.couplingStrength,
      description: `Codon dyadique [${pair.labelA} ⊕ ${pair.labelB}] : co-expression épistasique +${(pair.couplingStrength * 100).toFixed(1)}% (${pair.evidenceSources.toFixed(1)} obs.).`,
    });
  });

  // Ajout d'un codon triplet si au moins 3 gènes montrent une co-expression commune forte
  if (synergisticPairs.length >= 2) {
    const topGenesSet = new Set<AlgoKey>();
    for (const p of synergisticPairs) {
      topGenesSet.add(p.geneA);
      topGenesSet.add(p.geneB);
      if (topGenesSet.size >= 3) break;
    }
    const triplet = Array.from(topGenesSet).slice(0, 3);
    if (triplet.length === 3) {
      const idx0 = keyToIdx.get(triplet[0])!;
      const idx1 = keyToIdx.get(triplet[1])!;
      const idx2 = keyToIdx.get(triplet[2])!;
      const meanEpi =
        (epistaticMatrix[idx0][idx1] +
          epistaticMatrix[idx0][idx2] +
          epistaticMatrix[idx1][idx2]) /
        3;
      const combW = triplet.reduce((acc, g) => acc + (optimizedWeights[g] || 0), 0);
      codons.unshift({
        id: `codon_triplet_${triplet.join('_')}`,
        genes: triplet,
        labels: triplet.map((g) => LABELS_MAP[g] || g),
        arm: getChromosomalArm(triplet[0]),
        cohesionScore: Math.max(0, Math.min(100, Math.round(50 + meanEpi * 50))),
        combinedWeight: parseFloat(combW.toFixed(4)),
        synergyLift: parseFloat(meanEpi.toFixed(4)),
        description: `Super-Codon Triplet [${triplet.map((g) => LABELS_MAP[g] || g).join(' ⊕ ')}] : noyau de convergence génomique (${(combW * 100).toFixed(1)}% de masse).`,
      });
    }
  }

  // 12. Calcul des métriques de séquence & empreinte ADN
  const kendallTauShiftVsActive = computeNormalizedKendallTauDistance(
    activeSequenceOrder,
    optimizedSequenceOrder
  );
  const kendallTauShiftVsCanonical = computeNormalizedKendallTauDistance(
    canonicalSequenceOrder,
    optimizedSequenceOrder
  );
  const spearmanFootruleNormalized = computeNormalizedSpearmanFootrule(
    activeSequenceOrder,
    optimizedSequenceOrder
  );

  // Diversité de Shannon des poids optimisés
  let shannonW = 0;
  let activeCountForEntropy = 0;
  validKeys.forEach((k) => {
    const w = optimizedWeights[k] || 0;
    if (w > 0) {
      activeCountForEntropy++;
      shannonW -= w * Math.log2(w);
    }
  });
  const maxShannonW = Math.log2(Math.max(2, activeCountForEntropy));
  const shannonWeightDiversity = maxShannonW > 0 ? Math.min(1, shannonW / maxShannonW) : 1;

  // Distribution par bras chromosomique
  const armDistribution: DnaGeneSequenceMetrics['armDistribution'] = {
    STOCHASTIC_INFERENCE: { weightShare: 0, geneCount: 0, meanSignal: 0 },
    TEMPORAL_CADENCE: { weightShare: 0, geneCount: 0, meanSignal: 0 },
    SPECTRAL_FRACTAL: { weightShare: 0, geneCount: 0, meanSignal: 0 },
    TOPOLOGICAL_TRANSFER: { weightShare: 0, geneCount: 0, meanSignal: 0 },
  };
  geneSequence.forEach((node) => {
    const armBucket = armDistribution[node.chromosomalArm];
    armBucket.weightShare += node.optimizedWeight;
    armBucket.geneCount += 1;
    armBucket.meanSignal += node.postMortemSignal;
  });

  let armEntropy = 0;
  (Object.keys(armDistribution) as ChromosomalArm[]).forEach((arm) => {
    const b = armDistribution[arm];
    b.meanSignal = b.geneCount > 0 ? parseFloat((b.meanSignal / b.geneCount).toFixed(4)) : 0;
    b.weightShare = parseFloat(b.weightShare.toFixed(4));
    if (b.weightShare > 0) {
      armEntropy -= b.weightShare * Math.log2(b.weightShare);
    }
  });
  const armBalanceEntropy = parseFloat((armEntropy / Math.log2(4)).toFixed(4));

  // Cohérence épistasique moyenne pondérée par les poids
  let weightedEpistasisSum = 0;
  for (let i = 0; i < K; i++) {
    for (let j = i + 1; j < K; j++) {
      const wProd = (optimizedWeights[validKeys[i]] || 0) * (optimizedWeights[validKeys[j]] || 0);
      weightedEpistasisSum += wProd * epistaticMatrix[i][j];
    }
  }
  const epistaticCoherenceScore = parseFloat(
    Math.max(0, Math.min(100, 50 + 50 * Math.tanh(weightedEpistasisSum * K * 2.0))).toFixed(1)
  );

  const finalDriftMetrics = calculateWeightDriftMetrics(initialWeights, optimizedWeights);
  const baseFingerprint = computeModelDnaFingerprint(drawName, optimizedWeights);
  const sequenceSignature = buildSequenceSignature(optimizedSequenceOrder, baseFingerprint);

  const provenCount = geneSequence.filter((g) => g.hasEmpiricalProof).length;
  const auditTrail: string[] = [
    `Séquençage Génomique EpiGenome-SQ exécuté sur ${drawName} (${pureHistory.length} tirages, H=${bounds.hurstExponent.toFixed(3)}, S=${normalizedEntropy.toFixed(3)}).`,
    `Sources fusionnées : ${usableForensics.length} rapport(s) post-mortem, ${combinedAutopsies.length} autopsie(s) fermée(s), ${genomicEvaluatedCount} gènes d'audit génomique, ${cleanLineage.length} génération(s) ADN.`,
    `Séquence chromosomique : ${sequenceSignature} (Décalage Kendall-Tau=${(kendallTauShiftVsActive * 100).toFixed(1)}%, Diversité Shannon=${(shannonWeightDiversity * 100).toFixed(1)}%).`,
    `Garde empirique BH : ${provenCount}/${K} gène(s) avec preuve statistique ; ${codons.length} codon(s) épistasique(s) identifié(s).`,
    wasDamped
      ? `Régulation critique appliquée : Δmax=${(maxDelta * 100).toFixed(2)}% > seuil τ=${(criticalThreshold * 100).toFixed(2)}% (facteur amortissement=${dampingFactor.toFixed(3)}).`
      : `Dérive maîtrisée : Δmax=${(finalDriftMetrics.maxDelta * 100).toFixed(2)}% <= seuil τ=${(criticalThreshold * 100).toFixed(2)}%.`,
  ];

  return {
    drawName,
    computedAt: new Date().toISOString(),
    sequenceFingerprint: baseFingerprint,
    sourcesUsed: {
      historyDraws: pureHistory.length,
      forensicReports: usableForensics.length,
      autopsyReports: combinedAutopsies.length,
      genomicGenesEvaluated: genomicEvaluatedCount,
      dnaLineageGenerations: cleanLineage.length,
      hasDnaDriftReport: Boolean(dnaDriftReport),
    },
    sourceWeightsUsed: {
      forensic: parseFloat(sourceWeightsUsed.forensic.toFixed(4)),
      autopsy: parseFloat(sourceWeightsUsed.autopsy.toFixed(4)),
      genomic: parseFloat(sourceWeightsUsed.genomic.toFixed(4)),
      drift: parseFloat(sourceWeightsUsed.drift.toFixed(4)),
    },
    regimeContext: {
      regime: regimeInfo.regime || 'STANDARD',
      hurst: parseFloat(bounds.hurstExponent.toFixed(4)),
      entropy: parseFloat(normalizedEntropy.toFixed(4)),
      variance: parseFloat(bounds.variance.toFixed(6)),
    },
    geneSequence,
    epistaticCouplings: epistaticCouplings.slice(0, 24),
    codons,
    sequenceMetrics: {
      kendallTauShiftVsActive: parseFloat(kendallTauShiftVsActive.toFixed(4)),
      kendallTauShiftVsCanonical: parseFloat(kendallTauShiftVsCanonical.toFixed(4)),
      spearmanFootruleNormalized: parseFloat(spearmanFootruleNormalized.toFixed(4)),
      shannonWeightDiversity: parseFloat(shannonWeightDiversity.toFixed(4)),
      epistaticCoherenceScore,
      armDistribution,
      armBalanceEntropy,
      maxWeightDelta: parseFloat(finalDriftMetrics.maxDelta.toFixed(6)),
      criticalThreshold: parseFloat(criticalThreshold.toFixed(4)),
      isCriticalDrift,
      wasDamped,
      dampingFactor: parseFloat(dampingFactor.toFixed(4)),
      sequenceSignature,
    },
    initialWeights,
    optimizedWeights,
    auditTrail,
  };
}

/**
 * Orchestrateur asynchrone complet : collecte automatiquement les rapports post-mortem locaux,
 * la lignée ADN et le rapport de dérive ADN du tirage actif, synthétise la séquence & les poids,
 * et optionnellement applique les poids optimisés via `applyOptimizedWeights`.
 */
export async function runUnifiedDnaGeneSequencer(
  drawName: string,
  history: DrawResult[],
  currentWeights: AlgoWeights,
  options?: {
    autopsyReports?: ClosedLoopAutopsyReport[];
    batchAutopsy?: BatchClosedLoopAutopsyResult | null;
    genomicAudit?: GenomicAuditReport | null;
    forensicReports?: ForensicReport[];
    applyWeights?: boolean;
    isRetroactive?: boolean;
    allowCriticalDrift?: boolean;
  }
): Promise<DnaGeneSynthesisResult> {
  const pureHistory = purifyHistoryForDraw(drawName, history || []);

  const [localForensics, dnaLineage, dnaDriftReport] = await Promise.all([
    options?.forensicReports
      ? Promise.resolve(options.forensicReports)
      : import('../postPredictionAnalysisService')
          .then((m) => m.getLocalForensicReports())
          .catch(() => [] as ForensicReport[]),
    getModelDnaHistory(drawName, 40).catch(() => [] as ModelDnaRecord[]),
    pureHistory.length >= 5
      ? calculateDnaPerformanceDrift(drawName, pureHistory, currentWeights).catch(() => null)
      : Promise.resolve(null),
  ]);

  const synthesis = synthesizeDnaGeneSequenceAndWeights({
    drawName,
    history: pureHistory,
    currentWeights,
    forensicReports: localForensics,
    autopsyReports: options?.autopsyReports,
    batchAutopsy: options?.batchAutopsy,
    genomicAudit: options?.genomicAudit,
    dnaDriftReport,
    dnaLineage,
    allowCriticalDrift: options?.allowCriticalDrift,
  });

  if (options?.applyWeights) {
    const optRes = await applyOptimizedWeights({
      drawName,
      weights: synthesis.optimizedWeights,
      origin: 'GENETIC_EVOLUTION',
      history: pureHistory,
      sequenceProfile: {
        sequenceSignature: synthesis.sequenceMetrics.sequenceSignature,
        orderedGenes: synthesis.geneSequence.map((g) => g.key),
        kendallTauShiftFromPrevious: synthesis.sequenceMetrics.kendallTauShiftVsActive,
        epistaticCoherenceScore: synthesis.sequenceMetrics.epistaticCoherenceScore,
        topCodons: synthesis.codons.slice(0, 4).map((c) => ({
          id: c.id,
          genes: c.genes,
          cohesionScore: c.cohesionScore,
          synergyLift: c.synergyLift,
        })),
      },
      regimeContext: {
        regime: synthesis.regimeContext.regime,
        hurst: synthesis.regimeContext.hurst,
        entropy: synthesis.regimeContext.entropy,
      },
      causalAuditTrail: synthesis.auditTrail,
      reason: `Séquenceur Génomique EpiGenome-SQ (${synthesis.sequenceMetrics.sequenceSignature})`,
      allowCriticalDrift: options?.allowCriticalDrift,
      isRetroactive: options?.isRetroactive,
    });

    return {
      ...synthesis,
      optimizedWeights: optRes.appliedWeights,
      sequenceFingerprint: optRes.fingerprint,
    };
  }

  return synthesis;
}

export interface DnaGeneWalkForwardStep {
  stepIndex: number;
  drawDate: string;
  trainDrawsCount: number;
  regime: string;
  hurst: number;
  actualWinners: number[];
  top5Epigenome: number[];
  top5Baseline: number[];
  hitsTop5Epigenome: number;
  hitsTop5Baseline: number;
  expectedHitsTop5Epigenome: number;
  expectedHitsTop5Baseline: number;
  hitsTop10Epigenome: number;
  hitsTop10Baseline: number;
  brierEpigenome: number;
  brierBaseline: number;
  logLossEpigenome: number;
  logLossBaseline: number;
  aucEpigenome: number;
  aucBaseline: number;
  tauEpiUsed: number;
  hedgeHitsTop5: number;
  hedgeBrier: number;
  kendallTauShift: number;
  epistaticCoherenceScore: number;
  sequenceSignature: string;
}

export interface DnaRegimeConformalProfile {
  regime: string;
  stepsCount: number;
  meanHurst: number;
  meanBrierEpigenome: number;
  meanBrierBaseline: number;
  brierSkillScoreVsBaseline: number;
  meanHitsTop5Epigenome: number;
  conformalInterval: ConformalInterval;
  eceBeforeCalibration: number;
}

export interface DnaConformalCalibrationSummary {
  globalInterval: ConformalInterval;
  adaptiveCoverage: number;
  eceBeforeCalibration: number;
  eceAfterLooCalibration: number;
  calibrationDeltaEce: number;
  regimeProfiles: DnaRegimeConformalProfile[];
}

export interface PairedPermutationTestResult {
  sampleSize: number;
  meanDiff: number;
  stdErr: number;
  tStatistic: number;
  pValueTwoSided: number;
  pValueOneSidedPositive: number;
  ciLower95: number;
  ciUpper95: number;
  exactEnumeration: boolean;
  permutationsCount: number;
}

export type DnaGeneWalkForwardVerdict =
  | 'OUTPERFORMS_BASELINE'
  | 'PARITY_WITH_BASELINE'
  | 'UNDERPERFORMS_BASELINE'
  | 'INSUFFICIENT_DATA';

export interface DnaGeneWalkForwardResult {
  drawName: string;
  evaluatedAt: string;
  status: 'COMPLETED' | 'INSUFFICIENT_DATA';
  verdict: DnaGeneWalkForwardVerdict;
  evaluatedDrawsCount: number;
  minTrainDraws: number;
  h0MeanHitsTop5: number; // 5/18 ≈ 0.2778
  h0AtLeastOneHitRate: number; // 1 - C(85,5)/C(90,5) ≈ 0.2537
  h0BrierScore: number; // (5/90)*(85/90) ≈ 0.052469
  h0LogLossScore: number; // -[(5/90)ln(5/90) + (85/90)ln(85/90)] ≈ 0.21456
  meanHitsTop5Epigenome: number;
  meanHitsTop5Baseline: number;
  deltaMeanHitsTop5: number;
  atLeastOneHitRateEpigenome: number;
  atLeastOneHitRateBaseline: number;
  meanHitsTop10Epigenome: number;
  meanHitsTop10Baseline: number;
  meanBrierEpigenome: number;
  meanBrierBaseline: number;
  brierSkillScoreVsH0: number;
  brierSkillScoreVsBaseline: number;
  meanLogLossEpigenome: number;
  meanLogLossBaseline: number;
  logLossSkillScoreVsH0: number;
  logLossSkillScoreVsBaseline: number;
  meanAucEpigenome: number;
  meanAucBaseline: number;
  calibratedTauSummary: {
    meanTauEpi: number;
    finalTauEpi: number;
  };
  hedgeComparison: {
    meanHitsTop5Hedge: number;
    meanBrierHedge: number;
    deltaHitsVsBaseline: number;
    brierSkillScoreVsBaseline: number;
  };
  epigenomeZScoreVsH0: number;
  permutationTest: PairedPermutationTestResult;
  brierPermutationTest: PairedPermutationTestResult;
  conformalSummary: DnaConformalCalibrationSummary;
  steps: DnaGeneWalkForwardStep[];
  summaryText: string;
}

/**
 * Test de permutation apparié par inversion de signes (sign-flip) sur d_t = hitsEpi - hitsBase :
 * - Énumération exacte par code de Gray O(2^N) si N <= 20
 * - Monte-Carlo déterministe seedé si N > 20
 * Produit l'intervalle dual [ciLower95, ciUpper95] cohérent avec pValueTwoSided <= 0.05.
 */
export function runPairedSignFlipPermutationTest(
  diffs: number[],
  seed: number = 0x517cc1b7
): PairedPermutationTestResult {
  const N = diffs.length;
  if (N === 0) {
    return {
      sampleSize: 0,
      meanDiff: 0,
      stdErr: 0,
      tStatistic: 0,
      pValueTwoSided: 1,
      pValueOneSidedPositive: 1,
      ciLower95: 0,
      ciUpper95: 0,
      exactEnumeration: true,
      permutationsCount: 0,
    };
  }

  let sum = 0;
  for (let i = 0; i < N; i++) sum += diffs[i];
  const meanDiff = sum / N;

  let ss = 0;
  for (let i = 0; i < N; i++) {
    const dev = diffs[i] - meanDiff;
    ss += dev * dev;
  }
  const stdErr = N > 1 ? Math.sqrt(ss / (N * (N - 1))) : 0;
  const tStatistic =
    stdErr > 1e-12 ? meanDiff / stdErr : Math.abs(meanDiff) > 1e-12 ? Math.sign(meanDiff) * 1e6 : 0;

  if (N === 1) {
    const absM = Math.abs(meanDiff);
    return {
      sampleSize: 1,
      meanDiff: parseFloat(meanDiff.toFixed(6)),
      stdErr: 0,
      tStatistic: 0,
      pValueTwoSided: 1,
      pValueOneSidedPositive: meanDiff > 1e-12 ? 0.5 : 1,
      ciLower95: parseFloat((meanDiff - absM).toFixed(6)),
      ciUpper95: parseFloat((meanDiff + absM).toFixed(6)),
      exactEnumeration: true,
      permutationsCount: 2,
    };
  }

  const absObs = Math.abs(meanDiff);
  const exactEnumeration = N <= 20;

  if (exactEnumeration) {
    const totalPerms = 1 << N;
    const signs = new Int8Array(N).fill(1);
    let currentSum = sum;
    let exceedOne = currentSum / N >= meanDiff - 1e-12 ? 1 : 0;
    let exceedTwo = Math.abs(currentSum / N) >= absObs - 1e-12 ? 1 : 0;

    const stride = totalPerms <= 4096 ? 1 : Math.max(1, totalPerms >> 12);
    const sampledAbs: number[] = [Math.abs(currentSum / N)];

    for (let step = 1; step < totalPerms; step++) {
      const lsb = step & -step;
      const bit = Math.clz32(lsb) ^ 31;
      signs[bit] = -signs[bit];
      currentSum += 2 * signs[bit] * diffs[bit];
      const permMean = currentSum / N;
      const absPerm = Math.abs(permMean);
      if (permMean >= meanDiff - 1e-12) exceedOne++;
      if (absPerm >= absObs - 1e-12) exceedTwo++;
      if (step % stride === 0) sampledAbs.push(absPerm);
    }

    sampledAbs.sort((a, b) => a - b);
    const qIdx = Math.max(
      0,
      sampledAbs.length - 1 - Math.floor(0.05 * sampledAbs.length)
    );
    const critQuantile = sampledAbs[qIdx] ?? absObs;

    return {
      sampleSize: N,
      meanDiff: parseFloat(meanDiff.toFixed(6)),
      stdErr: parseFloat(stdErr.toFixed(6)),
      tStatistic: parseFloat(tStatistic.toFixed(4)),
      pValueTwoSided: parseFloat((exceedTwo / totalPerms).toFixed(6)),
      pValueOneSidedPositive: parseFloat((exceedOne / totalPerms).toFixed(6)),
      ciLower95: parseFloat((meanDiff - critQuantile).toFixed(6)),
      ciUpper95: parseFloat((meanDiff + critQuantile).toFixed(6)),
      exactEnumeration: true,
      permutationsCount: totalPerms,
    };
  }

  // N > 20 : Monte-Carlo déterministe seedé
  const numMc = 1999;
  const prng = new LCG((seed ^ 0x9e3779b9) >>> 0);
  let exceedOne = 1; // inclut l'observation (+1)
  let exceedTwo = 1;
  const absMeans: number[] = [absObs];

  for (let b = 0; b < numMc; b++) {
    let pSum = 0;
    for (let i = 0; i < N; i++) {
      pSum += prng.next() < 0.5 ? -diffs[i] : diffs[i];
    }
    const permMean = pSum / N;
    const absPerm = Math.abs(permMean);
    if (permMean >= meanDiff - 1e-12) exceedOne++;
    if (absPerm >= absObs - 1e-12) exceedTwo++;
    absMeans.push(absPerm);
  }

  absMeans.sort((a, b) => a - b);
  const qIdx = Math.max(0, absMeans.length - 1 - Math.floor(0.05 * absMeans.length));
  const critQuantile = absMeans[qIdx] ?? absObs;

  return {
    sampleSize: N,
    meanDiff: parseFloat(meanDiff.toFixed(6)),
    stdErr: parseFloat(stdErr.toFixed(6)),
    tStatistic: parseFloat(tStatistic.toFixed(4)),
    pValueTwoSided: parseFloat((exceedTwo / (numMc + 1)).toFixed(6)),
    pValueOneSidedPositive: parseFloat((exceedOne / (numMc + 1)).toFixed(6)),
    ciLower95: parseFloat((meanDiff - critQuantile).toFixed(6)),
    ciUpper95: parseFloat((meanDiff + critQuantile).toFixed(6)),
    exactEnumeration: false,
    permutationsCount: numMc + 1,
  };
}

function buildEmptyConformalSummary(): DnaConformalCalibrationSummary {
  return {
    globalInterval: {
      center: 0,
      lower: 0,
      upper: 5,
      quantile: 5,
      coverage: 0,
      sampleSize: 0,
    },
    adaptiveCoverage: 0,
    eceBeforeCalibration: 0,
    eceAfterLooCalibration: 0,
    calibrationDeltaEce: 0,
    regimeProfiles: [],
  };
}

function computeUniformLogLossBaseline(): number {
  const p0 = 5.0 / 90.0;
  return -(p0 * Math.log(p0) + (1.0 - p0) * Math.log(1.0 - p0));
}

function computeStepLogLoss(probs90: Float64Array, actualSet: Set<number>): number {
  let loss = 0;
  for (let n = 1; n <= 90; n++) {
    const p = Math.max(1e-6, Math.min(1.0 - 1e-6, probs90[n - 1] ?? 5.0 / 90.0));
    const y = actualSet.has(n) ? 1.0 : 0.0;
    loss -= y * Math.log(p) + (1.0 - y) * Math.log(1.0 - p);
  }
  return loss / 90.0;
}

/**
 * VALIDATION WALK-FORWARD HORS-ÉCHANTILLON D'EPIGENOME-SQ (100% CAUSALE, ZÉRO FUITE)
 *
 * - Démarre de poids neutres canoniques (ou du dernier snapshot de lignée antérieur au 1er pas)
 * - Filtre strictement rapports post-mortem (`date`, `dataCutoff`, `computedAt < targetTimeMs`)
 * - Exécute le pipeline causal complet par pas (épistasie conjointe I(i,j), dérive ADN, autopsie, lignée)
 * - Calibre la température softmax τ sans lookahead par grille nested OOS Log-Loss
 * - Évalue Hedge + Fixed-Share en parallèle
 * - Tranche le verdict par test de permutation apparié exact (N <= 20) / Monte-Carlo seedé (N > 20)
 */
export async function evaluateDnaGeneSequencerWalkForward(input: {
  drawName: string;
  history: DrawResult[];
  currentWeights?: AlgoWeights;
  forensicReports?: ForensicReport[];
  autopsyReports?: ClosedLoopAutopsyReport[];
  dnaLineage?: ModelDnaRecord[];
  maxSteps?: number;
}): Promise<DnaGeneWalkForwardResult> {
  const {
    drawName,
    history: rawHistory,
    forensicReports = [],
    autopsyReports = [],
    dnaLineage = [],
  } = input;
  const pureHistory = purifyHistoryForDraw(drawName, rawHistory || []);
  const hasMachine = drawHasMachineNumbers(drawName, pureHistory);

  const p0 = 5.0 / 90.0;
  const h0MeanHitsTop5 = 5.0 * p0;
  const h0AtLeastOneHitRate = 1.0 - (85 * 84 * 83 * 82 * 81) / (90 * 89 * 88 * 87 * 86);
  const h0BrierScore = p0 * (1.0 - p0);
  const h0LogLossScore = computeUniformLogLossBaseline();

  const minTrainDraws = Math.max(8, Math.min(12, Math.floor(pureHistory.length * 0.45)));
  const maxAvailableSteps = Math.max(0, pureHistory.length - minTrainDraws);
  const targetSteps =
    typeof input.maxSteps === 'number' && input.maxSteps > 0
      ? Math.min(maxAvailableSteps, Math.floor(input.maxSteps))
      : Math.min(maxAvailableSteps, Math.min(15, Math.max(3, Math.floor(Math.sqrt(pureHistory.length)))));

  // Point de départ neutre (zéro fuite de poids post-OOS) ou lignée strictement antérieure au 1er pas OOS
  const canonicalNeutral = normalizeWeights({
    ...getDefaultWeights(),
    ...(hasMachine ? {} : { [AlgoKey.MACHINE_TRANSFER]: 0 }),
  });

  if (pureHistory.length < 11 || targetSteps < 2) {
    return {
      drawName,
      evaluatedAt: new Date().toISOString(),
      status: 'INSUFFICIENT_DATA',
      verdict: 'INSUFFICIENT_DATA',
      evaluatedDrawsCount: 0,
      minTrainDraws,
      h0MeanHitsTop5: parseFloat(h0MeanHitsTop5.toFixed(4)),
      h0AtLeastOneHitRate: parseFloat(h0AtLeastOneHitRate.toFixed(4)),
      h0BrierScore: parseFloat(h0BrierScore.toFixed(6)),
      h0LogLossScore: parseFloat(h0LogLossScore.toFixed(6)),
      meanHitsTop5Epigenome: 0,
      meanHitsTop5Baseline: 0,
      deltaMeanHitsTop5: 0,
      atLeastOneHitRateEpigenome: 0,
      atLeastOneHitRateBaseline: 0,
      meanHitsTop10Epigenome: 0,
      meanHitsTop10Baseline: 0,
      meanBrierEpigenome: h0BrierScore,
      meanBrierBaseline: h0BrierScore,
      brierSkillScoreVsH0: 0,
      brierSkillScoreVsBaseline: 0,
      meanLogLossEpigenome: h0LogLossScore,
      meanLogLossBaseline: h0LogLossScore,
      logLossSkillScoreVsH0: 0,
      logLossSkillScoreVsBaseline: 0,
      meanAucEpigenome: 0.5,
      meanAucBaseline: 0.5,
      calibratedTauSummary: { meanTauEpi: 1.0, finalTauEpi: 1.0 },
      hedgeComparison: {
        meanHitsTop5Hedge: 0,
        meanBrierHedge: h0BrierScore,
        deltaHitsVsBaseline: 0,
        brierSkillScoreVsBaseline: 0,
      },
      epigenomeZScoreVsH0: 0,
      permutationTest: runPairedSignFlipPermutationTest([]),
      brierPermutationTest: runPairedSignFlipPermutationTest([]),
      conformalSummary: buildEmptyConformalSummary(),
      steps: [],
      summaryText: `Historique isolé insuffisant pour ${drawName} (${pureHistory.length} tirages ; minimum 11 requis pour une évaluation walk-forward causale).`,
    };
  }

  const firstOosTimeMs = parseDateSafely(pureHistory[targetSteps - 1].date).getTime();
  let baselineWeights: AlgoWeights = { ...canonicalNeutral };
  if (dnaLineage.length > 0 && Number.isFinite(firstOosTimeMs) && firstOosTimeMs > 0) {
    const preOosRecords = dnaLineage
      .filter((rec) => {
        if (rec.drawName && rec.drawName.trim().toLowerCase() !== drawName.trim().toLowerCase()) {
          return false;
        }
        const ts = parseDateSafely(rec.timestamp).getTime();
        return Number.isFinite(ts) && ts > 0 && ts < firstOosTimeMs;
      })
      .sort((a, b) => parseDateSafely(b.timestamp).getTime() - parseDateSafely(a.timestamp).getTime());
    if (preOosRecords.length > 0 && preOosRecords[0].weights) {
      const snapRaw: AlgoWeights = { ...getDefaultWeights(), ...preOosRecords[0].weights };
      if (!hasMachine) snapRaw[AlgoKey.MACHINE_TRANSFER] = 0;
      baselineWeights = normalizeWeights(snapRaw);
    }
  }

  const validKeys = Object.values(AlgoKey);
  const K = validKeys.length;
  const keyToIdx = new Map<AlgoKey, number>();
  validKeys.forEach((k, idx) => keyToIdx.set(k, idx));

  let runningWeights: AlgoWeights = { ...baselineWeights };
  let hedgeWeights: AlgoWeights = { ...baselineWeights };
  const steps: DnaGeneWalkForwardStep[] = [];
  const stepFolds: CalibrationPairs[] = [];
  const globalP: number[] = [];
  const globalY: number[] = [];
  const globalResiduals: number[] = [];
  const pastOosScoredSteps: Array<{ rawEpiScores: Float64Array; actualSet: Set<number> }> = [];
  const tauGrid = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  let prevStepAlgoScores: Record<string, Float32Array> | null = null;
  let prevStepWinners: number[] | null = null;
  let prevJointEpistasis: JointChannelEpistasisMatrix | null = null;
  const syntheticLineage: ModelDnaRecord[] = [];
  const byRegime = new Map<
    string,
    {
      stepsCount: number;
      hurstSum: number;
      brierEpiSum: number;
      brierBaseSum: number;
      hits5EpiSum: number;
      residuals: number[];
      p: number[];
      y: number[];
    }
  >();

  // Parcours chronologique strict : du plus ancien OOS (targetSteps - 1) au plus récent (0)
  for (let i = targetSteps - 1; i >= 0; i--) {
    const targetDraw = pureHistory[i];
    const trainHistory = pureHistory.slice(i + 1);
    const { winners: actualWinners } = extractDrawNumbers(targetDraw);
    if (actualWinners.length === 0 || trainHistory.length < minTrainDraws) {
      continue;
    }

    const actualSet = new Set(actualWinners);
    const targetTimeMs = parseDateSafely(targetDraw.date).getTime();

    // Coupure causale stricte sur les rapports post-mortem (date, dataCutoff, computedAt < targetTimeMs)
    const causalReports = forensicReports.filter((r) => {
      if (!r || r.drawName?.trim().toLowerCase() !== drawName.trim().toLowerCase()) {
        return false;
      }
      if (!Number.isFinite(targetTimeMs) || targetTimeMs <= 0) return false;
      const repTs = parseDateSafely(r.date).getTime();
      if (!Number.isFinite(repTs) || repTs <= 0 || repTs >= targetTimeMs) return false;
      if (r.dataCutoff) {
        const cutTs = parseDateSafely(r.dataCutoff).getTime();
        if (Number.isFinite(cutTs) && cutTs >= targetTimeMs) return false;
      }
      if (r.computedAt) {
        const compTs = new Date(r.computedAt).getTime();
        if (Number.isFinite(compTs) && compTs >= targetTimeMs) return false;
      }
      return true;
    });

    const causalAutopsies = autopsyReports.filter((a) => {
      if (a.drawName && a.drawName.trim().toLowerCase() !== drawName.trim().toLowerCase()) return false;
      const aTs = parseDateSafely(a.targetDrawDate).getTime();
      return Number.isFinite(aTs) && Number.isFinite(targetTimeMs) && aTs > 0 && aTs < targetTimeMs;
    });

    const causalLineage = [
      ...dnaLineage.filter((rec) => {
        if (rec.drawName && rec.drawName.trim().toLowerCase() !== drawName.trim().toLowerCase()) {
          return false;
        }
        const ts = parseDateSafely(rec.timestamp).getTime();
        return Number.isFinite(ts) && Number.isFinite(targetTimeMs) && ts > 0 && ts < targetTimeMs;
      }),
      ...syntheticLineage,
    ];

    const causalDrift =
      trainHistory.length >= 5
        ? await calculateDnaPerformanceDrift(drawName, trainHistory, runningWeights).catch(() => null)
        : null;

    const stepSynthesis = synthesizeDnaGeneSequenceAndWeights({
      drawName,
      history: trainHistory,
      currentWeights: runningWeights,
      forensicReports: causalReports,
      autopsyReports: causalAutopsies,
      dnaDriftReport: causalDrift,
      dnaLineage: causalLineage,
      jointEpistasis: prevJointEpistasis,
    });
    const epiWeights = stepSynthesis.optimizedWeights;

    // Évaluation unique des 25 canaux sur trainHistory (zéro fuite du tirage i)
    const [features, advancedMetrics] = await Promise.all([
      extractFeatures(drawName, trainHistory),
      computeAdvancedMetrics(trainHistory, drawName, {}, false, undefined),
    ]);
    const bounds = calculateStatisticalBounds(trainHistory);
    const context: AlgorithmContext = {
      features,
      advancedMetrics,
      history: trainHistory,
      weights: { ...epiWeights },
      algoWeights: { ...epiWeights },
      statisticalBounds: bounds,
      deterministicSeed: deriveSeedFromHistory(trainHistory),
      drawName,
      pluginCache: {},
    };

    algorithmRegistry.forEach((plugin) => {
      try {
        if (typeof plugin.precompute === 'function') {
          plugin.precompute(context);
        }
      } catch {
        // Repli silencieux sur plugin
      }
    });

    const trainHasMachine = drawHasMachineNumbers(drawName, trainHistory);
    const pluginScoresFlat = new Float64Array(K * 90);
    const epiWeightsFlat = new Float64Array(K);
    const baseWeightsFlat = new Float64Array(K);
    const hedgeWeightsFlat = new Float64Array(K);
    const algoScoresByKey: Record<string, Float32Array> = {};

    validKeys.forEach((k, gIdx) => {
      epiWeightsFlat[gIdx] = Number(epiWeights[k]) || 0;
      baseWeightsFlat[gIdx] = Number(baselineWeights[k]) || 0;
      hedgeWeightsFlat[gIdx] = Number(hedgeWeights[k]) || 0;
      algoScoresByKey[k] = new Float32Array(91);
    });

    for (let idx = 0; idx < algorithmRegistry.length; idx++) {
      const plugin = algorithmRegistry[idx];
      const gIdx = keyToIdx.get(plugin.key);
      if (gIdx === undefined) continue;
      if (!trainHasMachine && plugin.key === AlgoKey.MACHINE_TRANSFER) continue;
      const rowOff = gIdx * 90;
      const keyArr = algoScoresByKey[plugin.key];
      for (let num = 1; num <= 90; num++) {
        try {
          const ev = plugin.evaluate(num, context);
          const sNorm =
            typeof ev.score === 'number' && Number.isFinite(ev.score)
              ? Math.max(0, Math.min(100, ev.score)) / 100.0
              : 0;
          pluginScoresFlat[rowOff + (num - 1)] = sNorm;
          keyArr[num] = sNorm;
        } catch {
          pluginScoresFlat[rowOff + (num - 1)] = 0;
          keyArr[num] = 0;
        }
      }
    }

    // Calibration nested OOS de la température softmax τ uniquement à partir des pas OOS déjà observés
    let tauEpiUsed = 1.0;
    if (pastOosScoredSteps.length >= 1) {
      let bestTau = 1.0;
      let bestLoss = Infinity;
      for (const candTau of tauGrid) {
        let totalLoss = 0;
        for (const past of pastOosScoredSteps) {
          const marginals = calibrateScoresSoftmaxMarginals(past.rawEpiScores, candTau);
          totalLoss += computeStepLogLoss(marginals, past.actualSet);
        }
        if (totalLoss < bestLoss - 1e-12) {
          bestLoss = totalLoss;
          bestTau = candTau;
        }
      }
      tauEpiUsed = bestTau;
    }

    const winnersU8 = Uint8Array.from(actualWinners);
    const hpcStep = scoreEpigenomeWalkForwardStepHpc({
      pluginScoresFlat,
      epiWeights: epiWeightsFlat,
      baseWeights: baseWeightsFlat,
      numGenes: K,
      actualWinners: winnersU8,
      tauEpi: tauEpiUsed,
      tauBase: 1.0,
    });

    const hedgeStep = scoreEpigenomeWalkForwardStepHpc({
      pluginScoresFlat,
      epiWeights: hedgeWeightsFlat,
      baseWeights: baseWeightsFlat,
      numGenes: K,
      actualWinners: winnersU8,
      tauEpi: 1.0,
      tauBase: 1.0,
    });

    // Conserver le vecteur brut EpiGenome pour calibration τ des futurs pas OOS
    const rawEpiScores = new Float64Array(90);
    for (let n = 0; n < 90; n++) {
      let s = 0;
      for (let g = 0; g < K; g++) {
        s += epiWeightsFlat[g] * pluginScoresFlat[g * 90 + n];
      }
      rawEpiScores[n] = s;
    }
    pastOosScoredSteps.push({ rawEpiScores, actualSet });

    const stepRegime = stepSynthesis.regimeContext.regime || 'STANDARD';
    const stepHurst = stepSynthesis.regimeContext.hurst;
    const residualTop5 = Math.abs(hpcStep.hitsTop5Epi - hpcStep.expectedHitsTop5Epi);
    globalResiduals.push(residualTop5);

    const stepP = Array.from(hpcStep.epiIncProbs);
    const stepY = Array.from({ length: 90 }, (_, idx) => (actualSet.has(idx + 1) ? 1 : 0));
    stepFolds.push({ p: stepP, y: stepY });
    for (let n = 0; n < 90; n++) {
      globalP.push(stepP[n]);
      globalY.push(stepY[n]);
    }

    let regAcc = byRegime.get(stepRegime);
    if (!regAcc) {
      regAcc = {
        stepsCount: 0,
        hurstSum: 0,
        brierEpiSum: 0,
        brierBaseSum: 0,
        hits5EpiSum: 0,
        residuals: [],
        p: [],
        y: [],
      };
      byRegime.set(stepRegime, regAcc);
    }
    regAcc.stepsCount += 1;
    regAcc.hurstSum += stepHurst;
    regAcc.brierEpiSum += hpcStep.brierEpi;
    regAcc.brierBaseSum += hpcStep.brierBase;
    regAcc.hits5EpiSum += hpcStep.hitsTop5Epi;
    regAcc.residuals.push(residualTop5);
    for (let n = 0; n < 90; n++) {
      regAcc.p.push(stepP[n]);
      regAcc.y.push(stepY[n]);
    }

    steps.push({
      stepIndex: steps.length + 1,
      drawDate: targetDraw.date,
      trainDrawsCount: trainHistory.length,
      regime: stepRegime,
      hurst: stepHurst,
      actualWinners,
      top5Epigenome: Array.from(hpcStep.top5Epi),
      top5Baseline: Array.from(hpcStep.top5Base),
      hitsTop5Epigenome: hpcStep.hitsTop5Epi,
      hitsTop5Baseline: hpcStep.hitsTop5Base,
      expectedHitsTop5Epigenome: parseFloat(hpcStep.expectedHitsTop5Epi.toFixed(4)),
      expectedHitsTop5Baseline: parseFloat(hpcStep.expectedHitsTop5Base.toFixed(4)),
      hitsTop10Epigenome: hpcStep.hitsTop10Epi,
      hitsTop10Baseline: hpcStep.hitsTop10Base,
      brierEpigenome: parseFloat(hpcStep.brierEpi.toFixed(6)),
      brierBaseline: parseFloat(hpcStep.brierBase.toFixed(6)),
      logLossEpigenome: parseFloat(hpcStep.logLossEpi.toFixed(6)),
      logLossBaseline: parseFloat(hpcStep.logLossBase.toFixed(6)),
      aucEpigenome: parseFloat(hpcStep.aucEpi.toFixed(5)),
      aucBaseline: parseFloat(hpcStep.aucBase.toFixed(5)),
      tauEpiUsed,
      hedgeHitsTop5: hedgeStep.hitsTop5Epi,
      hedgeBrier: parseFloat(hedgeStep.brierEpi.toFixed(6)),
      kendallTauShift: stepSynthesis.sequenceMetrics.kendallTauShiftVsActive,
      epistaticCoherenceScore: stepSynthesis.sequenceMetrics.epistaticCoherenceScore,
      sequenceSignature: stepSynthesis.sequenceMetrics.sequenceSignature,
    });

    // Mise à jour causale APRÈS observation du tirage cible :
    // 1. Épistasie causale conjointe par double ablation sur le pas courant pour les pas suivants
    if (prevStepAlgoScores && prevStepWinners) {
      prevJointEpistasis = computeJointChannelAblationMatrix({
        channelKeys: validKeys,
        algoScores: prevStepAlgoScores,
        weights: runningWeights as unknown as Record<string, number>,
        actualWinners: prevStepWinners,
      });
    } else {
      prevJointEpistasis = computeJointChannelAblationMatrix({
        channelKeys: validKeys,
        algoScores: algoScoresByKey,
        weights: epiWeights as unknown as Record<string, number>,
        actualWinners,
      });
    }
    prevStepAlgoScores = algoScoresByKey;
    prevStepWinners = actualWinners;

    // 2. Mise à jour Hedge + Fixed-Share via pertes Brier normalisées par canal
    const channelLosses = new Float64Array(K);
    const forcedZeroArr = new Uint8Array(K);
    const priorArr = new Float64Array(K);
    for (let g = 0; g < K; g++) {
      const k = validKeys[g];
      const isForced = RETIRED_ALGO_WEIGHT_KEYS.has(k) || (!trainHasMachine && k === AlgoKey.MACHINE_TRANSFER);
      forcedZeroArr[g] = isForced ? 1 : 0;
      priorArr[g] = Number(baselineWeights[k]) || 0;
      if (isForced) {
        channelLosses[g] = 1.0;
        continue;
      }
      const chSlice = pluginScoresFlat.subarray(g * 90, (g + 1) * 90);
      const chMarginals = calibrateScoresSoftmaxMarginals(chSlice, 1.0);
      let bSum = 0;
      for (let n = 1; n <= 90; n++) {
        const y = actualSet.has(n) ? 1.0 : 0.0;
        const q = chMarginals[n - 1];
        bSum += (q - y) * (q - y);
      }
      channelLosses[g] = Math.min(1.0, bSum / 90.0 / Math.max(1e-6, 4.0 * h0BrierScore));
    }

    const hedgeRes = computeHedgeFixedShareStepHpc({
      currentWeights: hedgeWeightsFlat,
      channelLosses,
      priorWeights: priorArr,
      forcedZeroFlags: forcedZeroArr,
      horizonT: Math.max(2, targetSteps),
    });
    const nextHedge = { ...hedgeWeights };
    validKeys.forEach((k, g) => {
      nextHedge[k] = hedgeRes.weights[g] ?? nextHedge[k];
    });
    hedgeWeights = normalizeWeights(nextHedge);

    syntheticLineage.push({
      id: `oos_${steps.length}`,
      version: `oos_step_${steps.length}`,
      drawName,
      timestamp: targetDraw.date,
      weights: epiWeights,
      origin: 'GENETIC_EVOLUTION',
      dnaFingerprint: stepSynthesis.sequenceFingerprint,
      sequenceProfile: {
        sequenceSignature: stepSynthesis.sequenceMetrics.sequenceSignature,
        orderedGenes: stepSynthesis.geneSequence.map((g) => g.key),
        kendallTauShiftFromPrevious: stepSynthesis.sequenceMetrics.kendallTauShiftVsActive,
        epistaticCoherenceScore: stepSynthesis.sequenceMetrics.epistaticCoherenceScore,
        topCodons: stepSynthesis.codons.slice(0, 3).map((c) => ({
          id: c.id,
          genes: c.genes,
          cohesionScore: c.cohesionScore,
          synergyLift: c.synergyLift,
        })),
      },
      specializations: [],
      performance: { brierScore: hpcStep.brierEpi, hitRate: hpcStep.hitsTop5Epi / 5.0 },
      causalAuditTrail: [],
    });

    runningWeights = epiWeights;
  }

  const N = steps.length;
  if (N === 0) {
    return {
      drawName,
      evaluatedAt: new Date().toISOString(),
      status: 'INSUFFICIENT_DATA',
      verdict: 'INSUFFICIENT_DATA',
      evaluatedDrawsCount: 0,
      minTrainDraws,
      h0MeanHitsTop5: parseFloat(h0MeanHitsTop5.toFixed(4)),
      h0AtLeastOneHitRate: parseFloat(h0AtLeastOneHitRate.toFixed(4)),
      h0BrierScore: parseFloat(h0BrierScore.toFixed(6)),
      h0LogLossScore: parseFloat(h0LogLossScore.toFixed(6)),
      meanHitsTop5Epigenome: 0,
      meanHitsTop5Baseline: 0,
      deltaMeanHitsTop5: 0,
      atLeastOneHitRateEpigenome: 0,
      atLeastOneHitRateBaseline: 0,
      meanHitsTop10Epigenome: 0,
      meanHitsTop10Baseline: 0,
      meanBrierEpigenome: h0BrierScore,
      meanBrierBaseline: h0BrierScore,
      brierSkillScoreVsH0: 0,
      brierSkillScoreVsBaseline: 0,
      meanLogLossEpigenome: h0LogLossScore,
      meanLogLossBaseline: h0LogLossScore,
      logLossSkillScoreVsH0: 0,
      logLossSkillScoreVsBaseline: 0,
      meanAucEpigenome: 0.5,
      meanAucBaseline: 0.5,
      calibratedTauSummary: { meanTauEpi: 1.0, finalTauEpi: 1.0 },
      hedgeComparison: {
        meanHitsTop5Hedge: 0,
        meanBrierHedge: h0BrierScore,
        deltaHitsVsBaseline: 0,
        brierSkillScoreVsBaseline: 0,
      },
      epigenomeZScoreVsH0: 0,
      permutationTest: runPairedSignFlipPermutationTest([]),
      brierPermutationTest: runPairedSignFlipPermutationTest([]),
      conformalSummary: buildEmptyConformalSummary(),
      steps: [],
      summaryText: `Aucun pas hors-échantillon exploitable pour ${drawName}.`,
    };
  }

  const sumHits5Epi = steps.reduce((a, s) => a + s.hitsTop5Epigenome, 0);
  const sumHits5Base = steps.reduce((a, s) => a + s.hitsTop5Baseline, 0);
  const sumHits10Epi = steps.reduce((a, s) => a + s.hitsTop10Epigenome, 0);
  const sumHits10Base = steps.reduce((a, s) => a + s.hitsTop10Baseline, 0);
  const sumBrierEpi = steps.reduce((a, s) => a + s.brierEpigenome, 0);
  const sumBrierBase = steps.reduce((a, s) => a + s.brierBaseline, 0);
  const sumLogLossEpi = steps.reduce((a, s) => a + s.logLossEpigenome, 0);
  const sumLogLossBase = steps.reduce((a, s) => a + s.logLossBaseline, 0);
  const sumAucEpi = steps.reduce((a, s) => a + s.aucEpigenome, 0);
  const sumAucBase = steps.reduce((a, s) => a + s.aucBaseline, 0);
  const sumTauEpi = steps.reduce((a, s) => a + s.tauEpiUsed, 0);
  const sumHitsHedge = steps.reduce((a, s) => a + s.hedgeHitsTop5, 0);
  const sumBrierHedge = steps.reduce((a, s) => a + s.hedgeBrier, 0);
  const atLeastOneEpi = steps.filter((s) => s.hitsTop5Epigenome >= 1).length;
  const atLeastOneBase = steps.filter((s) => s.hitsTop5Baseline >= 1).length;

  const meanHitsTop5Epigenome = sumHits5Epi / N;
  const meanHitsTop5Baseline = sumHits5Base / N;
  const deltaMeanHitsTop5 = meanHitsTop5Epigenome - meanHitsTop5Baseline;
  const atLeastOneHitRateEpigenome = atLeastOneEpi / N;
  const atLeastOneHitRateBaseline = atLeastOneBase / N;
  const meanHitsTop10Epigenome = sumHits10Epi / N;
  const meanHitsTop10Baseline = sumHits10Base / N;
  const meanBrierEpigenome = sumBrierEpi / N;
  const meanBrierBaseline = sumBrierBase / N;
  const meanLogLossEpigenome = sumLogLossEpi / N;
  const meanLogLossBaseline = sumLogLossBase / N;
  const meanAucEpigenome = sumAucEpi / N;
  const meanAucBaseline = sumAucBase / N;
  const meanHitsTop5Hedge = sumHitsHedge / N;
  const meanBrierHedge = sumBrierHedge / N;

  const brierSkillScoreVsH0 = h0BrierScore > 0 ? 1.0 - meanBrierEpigenome / h0BrierScore : 0;
  const brierSkillScoreVsBaseline =
    meanBrierBaseline > 0 ? 1.0 - meanBrierEpigenome / meanBrierBaseline : 0;
  const logLossSkillScoreVsH0 = h0LogLossScore > 0 ? 1.0 - meanLogLossEpigenome / h0LogLossScore : 0;
  const logLossSkillScoreVsBaseline =
    meanLogLossBaseline > 0 ? 1.0 - meanLogLossEpigenome / meanLogLossBaseline : 0;
  const hedgeBssVsBase = meanBrierBaseline > 0 ? 1.0 - meanBrierHedge / meanBrierBaseline : 0;

  // Test binomial sur N * 5 sélections face à H0 (p0 = 5/90)
  const totalSlots = N * 5;
  const empiricalSlotRate = sumHits5Epi / totalSlots;
  const slotStdErr = Math.sqrt((p0 * (1.0 - p0)) / totalSlots);
  const epigenomeZScoreVsH0 = slotStdErr > 0 ? (empiricalSlotRate - p0) / slotStdErr : 0;

  // Test de permutation apparié exact / Monte-Carlo seedé sur d_t = hitsEpi - hitsBase et dBrier_t = brierBase - brierEpi
  const hitDiffs = steps.map((s) => s.hitsTop5Epigenome - s.hitsTop5Baseline);
  const brierDiffs = steps.map((s) => s.brierBaseline - s.brierEpigenome);
  const wfSeed = deriveSeedFromHistory(pureHistory);
  const permutationTest = runPairedSignFlipPermutationTest(hitDiffs, wfSeed);
  const brierPermutationTest = runPairedSignFlipPermutationTest(brierDiffs, wfSeed ^ 0x517cc1b7);

  // Calibration conforme distribution-free & ECE globale / par régime
  const adaptiveCoverage = coverageFromSampleSize(N);
  const globalInterval = conformalInterval(
    globalResiduals,
    meanHitsTop5Epigenome,
    5,
    adaptiveCoverage
  );
  const eceBeforeCalibration = computeEce({ p: globalP, y: globalY });
  const eceAfterLooCalibration =
    stepFolds.length >= 2 ? looEceAfterCalibration(stepFolds) : eceBeforeCalibration;
  const calibrationDeltaEce = eceBeforeCalibration - eceAfterLooCalibration;

  const regimeProfiles: DnaRegimeConformalProfile[] = Array.from(byRegime.entries())
    .map(([regime, acc]) => {
      const mBrierEpi = acc.brierEpiSum / acc.stepsCount;
      const mBrierBase = acc.brierBaseSum / acc.stepsCount;
      const mHits5 = acc.hits5EpiSum / acc.stepsCount;
      const regCov = coverageFromSampleSize(acc.stepsCount);
      const regInterval = conformalInterval(acc.residuals, mHits5, 5, regCov);
      const regBss = mBrierBase > 0 ? 1.0 - mBrierEpi / mBrierBase : 0;
      const regEce = computeEce({ p: acc.p, y: acc.y });
      return {
        regime,
        stepsCount: acc.stepsCount,
        meanHurst: parseFloat((acc.hurstSum / acc.stepsCount).toFixed(4)),
        meanBrierEpigenome: parseFloat(mBrierEpi.toFixed(6)),
        meanBrierBaseline: parseFloat(mBrierBase.toFixed(6)),
        brierSkillScoreVsBaseline: parseFloat(regBss.toFixed(4)),
        meanHitsTop5Epigenome: parseFloat(mHits5.toFixed(4)),
        conformalInterval: {
          center: parseFloat(regInterval.center.toFixed(4)),
          lower: parseFloat(regInterval.lower.toFixed(4)),
          upper: parseFloat(regInterval.upper.toFixed(4)),
          quantile: parseFloat(regInterval.quantile.toFixed(4)),
          coverage: parseFloat(regInterval.coverage.toFixed(4)),
          sampleSize: regInterval.sampleSize,
        },
        eceBeforeCalibration: parseFloat(regEce.toFixed(6)),
      };
    })
    .sort((a, b) => b.stepsCount - a.stepsCount || a.regime.localeCompare(b.regime));

  const conformalSummary: DnaConformalCalibrationSummary = {
    globalInterval: {
      center: parseFloat(globalInterval.center.toFixed(4)),
      lower: parseFloat(globalInterval.lower.toFixed(4)),
      upper: parseFloat(globalInterval.upper.toFixed(4)),
      quantile: parseFloat(globalInterval.quantile.toFixed(4)),
      coverage: parseFloat(globalInterval.coverage.toFixed(4)),
      sampleSize: globalInterval.sampleSize,
    },
    adaptiveCoverage: parseFloat(adaptiveCoverage.toFixed(4)),
    eceBeforeCalibration: parseFloat(eceBeforeCalibration.toFixed(6)),
    eceAfterLooCalibration: parseFloat(eceAfterLooCalibration.toFixed(6)),
    calibrationDeltaEce: parseFloat(calibrationDeltaEce.toFixed(6)),
    regimeProfiles,
  };

  // Verdict STATISTIQUE : OUTPERFORMS uniquement si borne inférieure CI95 > 0, UNDERPERFORMS si borne sup < 0
  let verdict: DnaGeneWalkForwardVerdict = 'PARITY_WITH_BASELINE';
  if (permutationTest.ciLower95 > 0) {
    verdict = 'OUTPERFORMS_BASELINE';
  } else if (permutationTest.ciUpper95 < 0) {
    verdict = 'UNDERPERFORMS_BASELINE';
  } else if (Math.abs(deltaMeanHitsTop5) <= 1e-6 && brierPermutationTest.ciLower95 > 0) {
    verdict = 'OUTPERFORMS_BASELINE';
  } else if (Math.abs(deltaMeanHitsTop5) <= 1e-6 && brierPermutationTest.ciUpper95 < 0) {
    verdict = 'UNDERPERFORMS_BASELINE';
  }

  const summaryText = `Walk-Forward OOS (N=${N}) : Epi ${meanHitsTop5Epigenome.toFixed(2)} hits/tirage vs Base ${meanHitsTop5Baseline.toFixed(2)} (IC95% [${permutationTest.ciLower95.toFixed(3)} ; ${permutationTest.ciUpper95.toFixed(3)}], p=${permutationTest.pValueTwoSided.toFixed(3)}) · LogLoss=${meanLogLossEpigenome.toFixed(4)} · AUC=${meanAucEpigenome.toFixed(3)} · BSS=${(brierSkillScoreVsBaseline * 100).toFixed(2)}%.`;

  return {
    drawName,
    evaluatedAt: new Date().toISOString(),
    status: 'COMPLETED',
    verdict,
    evaluatedDrawsCount: N,
    minTrainDraws,
    h0MeanHitsTop5: parseFloat(h0MeanHitsTop5.toFixed(4)),
    h0AtLeastOneHitRate: parseFloat(h0AtLeastOneHitRate.toFixed(4)),
    h0BrierScore: parseFloat(h0BrierScore.toFixed(6)),
    h0LogLossScore: parseFloat(h0LogLossScore.toFixed(6)),
    meanHitsTop5Epigenome: parseFloat(meanHitsTop5Epigenome.toFixed(4)),
    meanHitsTop5Baseline: parseFloat(meanHitsTop5Baseline.toFixed(4)),
    deltaMeanHitsTop5: parseFloat(deltaMeanHitsTop5.toFixed(4)),
    atLeastOneHitRateEpigenome: parseFloat(atLeastOneHitRateEpigenome.toFixed(4)),
    atLeastOneHitRateBaseline: parseFloat(atLeastOneHitRateBaseline.toFixed(4)),
    meanHitsTop10Epigenome: parseFloat(meanHitsTop10Epigenome.toFixed(4)),
    meanHitsTop10Baseline: parseFloat(meanHitsTop10Baseline.toFixed(4)),
    meanBrierEpigenome: parseFloat(meanBrierEpigenome.toFixed(6)),
    meanBrierBaseline: parseFloat(meanBrierBaseline.toFixed(6)),
    brierSkillScoreVsH0: parseFloat(brierSkillScoreVsH0.toFixed(4)),
    brierSkillScoreVsBaseline: parseFloat(brierSkillScoreVsBaseline.toFixed(4)),
    meanLogLossEpigenome: parseFloat(meanLogLossEpigenome.toFixed(6)),
    meanLogLossBaseline: parseFloat(meanLogLossBaseline.toFixed(6)),
    logLossSkillScoreVsH0: parseFloat(logLossSkillScoreVsH0.toFixed(4)),
    logLossSkillScoreVsBaseline: parseFloat(logLossSkillScoreVsBaseline.toFixed(4)),
    meanAucEpigenome: parseFloat(meanAucEpigenome.toFixed(5)),
    meanAucBaseline: parseFloat(meanAucBaseline.toFixed(5)),
    calibratedTauSummary: {
      meanTauEpi: parseFloat((sumTauEpi / N).toFixed(3)),
      finalTauEpi: steps[N - 1].tauEpiUsed,
    },
    hedgeComparison: {
      meanHitsTop5Hedge: parseFloat(meanHitsTop5Hedge.toFixed(4)),
      meanBrierHedge: parseFloat(meanBrierHedge.toFixed(6)),
      deltaHitsVsBaseline: parseFloat((meanHitsTop5Hedge - meanHitsTop5Baseline).toFixed(4)),
      brierSkillScoreVsBaseline: parseFloat(hedgeBssVsBase.toFixed(4)),
    },
    epigenomeZScoreVsH0: parseFloat(epigenomeZScoreVsH0.toFixed(3)),
    permutationTest,
    brierPermutationTest,
    conformalSummary,
    steps,
    summaryText,
  };
}

export interface NetworkWalkForwardResult {
  networkId: 'hebdomadaire' | 'quotidien';
  evaluatedAt: string;
  drawsEvaluated: string[];
  totalOosDrawsCount: number;
  verdict: DnaGeneWalkForwardVerdict;
  meanHitsTop5Epigenome: number;
  meanHitsTop5Baseline: number;
  deltaMeanHitsTop5: number;
  brierSkillScoreVsBaseline: number;
  meanLogLossEpigenome: number;
  meanAucEpigenome: number;
  permutationTest: PairedPermutationTestResult;
  perDrawResults: DnaGeneWalkForwardResult[];
}

/**
 * Agrégation ÉVALUATION UNIQUEMENT des statistiques hors-échantillon au sein d'un même réseau fermé
 * (`hebdomadaire` 6 tirages ou `quotidien` 22 tirages) pour accroître la puissance N.
 * Conforme AGENTS.md #2 : chaque tirage conserve son estimateur strictement isolé ; aucune donnée
 * inter-réseaux ni aucun poids inter-tirages n'est mutualisé.
 */
export async function evaluateNetworkWalkForward(input: {
  networkId: 'hebdomadaire' | 'quotidien';
  history?: DrawResult[];
  historyByDraw?: Record<string, DrawResult[]>;
  forensicReports?: ForensicReport[];
  maxStepsPerDraw?: number;
}): Promise<NetworkWalkForwardResult> {
  const { networkId, history = [], historyByDraw = {}, forensicReports = [], maxStepsPerDraw } = input;
  const networkCfg = INTER_DRAW_NETWORKS[networkId];
  const allowedDrawNames = new Set(networkCfg.drawNames.map((n) => normalizeDrawName(n)));

  const perDrawResults: DnaGeneWalkForwardResult[] = [];
  for (const officialName of networkCfg.drawNames) {
    const norm = normalizeDrawName(officialName);
    if (!allowedDrawNames.has(norm) || getDrawNetworkId(officialName) !== networkId) continue;

    const rawForDraw =
      historyByDraw[officialName] ||
      historyByDraw[norm] ||
      history.filter((d) => getDrawNetworkId(d.drawName) === networkId && normalizeDrawName(d.drawName) === norm);

    if (!rawForDraw || rawForDraw.length < 11) continue;

    const res = await evaluateDnaGeneSequencerWalkForward({
      drawName: officialName,
      history: rawForDraw,
      forensicReports: forensicReports.filter(
        (r) => getDrawNetworkId(r.drawName) === networkId && normalizeDrawName(r.drawName) === norm
      ),
      maxSteps: maxStepsPerDraw,
    });
    if (res.status === 'COMPLETED' && res.evaluatedDrawsCount > 0) {
      perDrawResults.push(res);
    }
  }

  const pooledSteps = perDrawResults.flatMap((r) => r.steps);
  const totalN = pooledSteps.length;
  if (totalN === 0) {
    return {
      networkId,
      evaluatedAt: new Date().toISOString(),
      drawsEvaluated: [],
      totalOosDrawsCount: 0,
      verdict: 'INSUFFICIENT_DATA',
      meanHitsTop5Epigenome: 0,
      meanHitsTop5Baseline: 0,
      deltaMeanHitsTop5: 0,
      brierSkillScoreVsBaseline: 0,
      meanLogLossEpigenome: computeUniformLogLossBaseline(),
      meanAucEpigenome: 0.5,
      permutationTest: runPairedSignFlipPermutationTest([]),
      perDrawResults,
    };
  }

  const hitDiffs = pooledSteps.map((s) => s.hitsTop5Epigenome - s.hitsTop5Baseline);
  const meanHitsEpi = pooledSteps.reduce((a, s) => a + s.hitsTop5Epigenome, 0) / totalN;
  const meanHitsBase = pooledSteps.reduce((a, s) => a + s.hitsTop5Baseline, 0) / totalN;
  const meanBrierEpi = pooledSteps.reduce((a, s) => a + s.brierEpigenome, 0) / totalN;
  const meanBrierBase = pooledSteps.reduce((a, s) => a + s.brierBaseline, 0) / totalN;
  const meanLogLossEpi = pooledSteps.reduce((a, s) => a + s.logLossEpigenome, 0) / totalN;
  const meanAucEpi = pooledSteps.reduce((a, s) => a + s.aucEpigenome, 0) / totalN;

  const permTest = runPairedSignFlipPermutationTest(
    hitDiffs,
    deriveSeedFromHistory(history.length > 0 ? history : Object.values(historyByDraw).flat())
  );

  let verdict: DnaGeneWalkForwardVerdict = 'PARITY_WITH_BASELINE';
  if (permTest.ciLower95 > 0) verdict = 'OUTPERFORMS_BASELINE';
  else if (permTest.ciUpper95 < 0) verdict = 'UNDERPERFORMS_BASELINE';

  return {
    networkId,
    evaluatedAt: new Date().toISOString(),
    drawsEvaluated: perDrawResults.map((r) => r.drawName),
    totalOosDrawsCount: totalN,
    verdict,
    meanHitsTop5Epigenome: parseFloat(meanHitsEpi.toFixed(4)),
    meanHitsTop5Baseline: parseFloat(meanHitsBase.toFixed(4)),
    deltaMeanHitsTop5: parseFloat((meanHitsEpi - meanHitsBase).toFixed(4)),
    brierSkillScoreVsBaseline: parseFloat(
      (meanBrierBase > 0 ? 1.0 - meanBrierEpi / meanBrierBase : 0).toFixed(4)
    ),
    meanLogLossEpigenome: parseFloat(meanLogLossEpi.toFixed(6)),
    meanAucEpigenome: parseFloat(meanAucEpi.toFixed(5)),
    permutationTest: permTest,
    perDrawResults,
  };
}


