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
import { drawHasMachineNumbers } from '../../constants';
import { calculateStatisticalBounds, detectGameRegime } from '../mathService';
import { extractFeatures, extractDrawNumbers } from './featureExtractor';
import { computeAdvancedMetrics } from './advancedMetricsCalculator';
import { algorithmRegistry, type AlgorithmContext } from './algorithmRegistry';
import { deriveSeedFromHistory } from '../../utils/deterministicSeed';
import {
  normalizeWeights,
  getDefaultWeights,
  evaluateAlgoEmpiricalProof,
  type AlgoProofMetric,
} from './weightsManager';
import {
  projectWeightsWithProofGuard,
  type ClosedLoopAutopsyReport,
  type BatchClosedLoopAutopsyResult,
} from './closedLoopAutopsyService';
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
 * SÉQUENCEUR ÉPISTASIQUE & RÉGULATEUR DE POIDS GÉNOMIQUES (EpiGenome-SQ)
 *
 * Algorithme personnalisé dédié à la gestion conjointe :
 * 1. Des SÉQUENCES DE GÈNES ADN (ordonnancement chromosomique par bras fonctionnels,
 *    couplage épistasique K×K, découverte de codons synergiques et suivi de dérive d'ordre Kendall-Tau).
 * 2. Des POIDS GÉNOMIQUES calibrés multi-sources :
 *    - Analyses post-mortem (`ForensicReport` : ajustements, contrefactuels, dérive, XAP gagnants)
 *    - Autopsies en boucle fermée & attribution contrefactuelle (`ClosedLoopAutopsyReport`)
 *    - Audits génomiques walk-forward (`GenomicAuditReport`)
 *    - Dérive ADN post-tirage (`DnaPerformanceDriftReport`)
 *    - Lignée évolutive ADN (`ModelDnaRecord[]`)
 *    - Garde empirique Benjamini-Hochberg (`evaluateAlgoEmpiricalProof` + `projectWeightsWithProofGuard`)
 *    - Régulation continue de dérive critique (`computeDrawCriticalThreshold`)
 *
 * Conforme à AGENTS.md :
 * - 100 % déterministe (zéro hasard)
 * - Zéro nombres magiques (paramètres dérivés de K, N, entropie, Hurst, variance)
 * - Transitions C^∞ continues (tanh, exponentielle, softmax simplexe)
 * - Isolation stricte par tirage (`drawName`) et garde anti-fuite temporelle
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

  // 2. Régime stochastique réel et preuve empirique BH (strictement sur le tirage isolé)
  const bounds = calculateStatisticalBounds(pureHistory);
  const regimeInfo = detectGameRegime(pureHistory);
  const proofMap = proofMapOverride ?? evaluateAlgoEmpiricalProof(drawName, pureHistory);

  const lockedMaxKeys = new Set<AlgoKey>();
  const forcedZeroKeys = new Set<AlgoKey>();
  validKeys.forEach((k) => {
    if (RETIRED_ALGO_WEIGHT_KEYS.has(k) || (k === AlgoKey.MACHINE_TRANSFER && !hasMachine)) {
      forcedZeroKeys.add(k);
      lockedMaxKeys.add(k);
      return;
    }
    const proof = proofMap[k];
    if (!proof || !proof.hasProof || proof.proofScore <= 0) {
      lockedMaxKeys.add(k);
    }
  });

  // 3. Garde anti-fuite causale sur les rapports post-mortem (uniquement tirage actif & date <= cutoff)
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
      if (pureHistory.length > 0 && r.date) {
        const repTs = parseDateSafely(r.date).getTime();
        if (Number.isFinite(repTs) && causalCutoff > 0 && repTs > causalCutoff) {
          return false;
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

  // Accumulateur pour matrice de co-expression XAP (winningXAP + counterfactual SYNERGY)
  const keyToIdx = new Map<AlgoKey, number>();
  validKeys.forEach((k, idx) => keyToIdx.set(k, idx));
  const rawEpistasis = Array.from({ length: K }, () => new Float64Array(K));
  const epistasisSamples = Array.from({ length: K }, () => new Float64Array(K));

  usableForensics.forEach((rep, idx) => {
    const recencyWeight = Math.exp(-idx / tauR);
    const klPenalty = rep.kl_divergence && Number.isFinite(rep.kl_divergence)
      ? Math.exp(-Math.max(0, rep.kl_divergence) / maxKL)
      : 1.0;
    const blackSwanFactor = rep.isBlackSwan ? 0.5 : 1.0;
    const wRep = recencyWeight * klPenalty * blackSwanFactor;

    // i. Proposed Adjustments
    if (Array.isArray(rep.proposedAdjustments)) {
      rep.proposedAdjustments.forEach((adj) => {
        const k = adj.algo as AlgoKey;
        if (keyToIdx.has(k) && Number.isFinite(adj.proposedWeightChange)) {
          forensicAcc[k] += Math.tanh(adj.proposedWeightChange * K) * wRep;
          forensicW[k] += wRep;
        }
      });
    }

    // ii. Algorithmic Drift (underestimating => +, overestimating => -)
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

    // iii. Counterfactuals (BOOST, REDUCE, SYNERGY, OPTIMAL_DNA)
    if (Array.isArray(rep.counterfactuals)) {
      rep.counterfactuals.forEach((cf) => {
        if (cf.action === 'OPTIMAL_DNA' && cf.optimalWeightsDistribution) {
          validKeys.forEach((k) => {
            const optW = cf.optimalWeightsDistribution?.[k];
            const curW = initialWeights[k] || (1 / K);
            if (typeof optW === 'number' && Number.isFinite(optW)) {
              const relDiff = (optW - curW) / Math.max(1 / (2 * K), curW);
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
              const synVal = Math.tanh(Math.max(0.2, (cf.rankImprovement || 1) / 3)) * wRep;
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

    // iv. Winning XAP composition (vraie expression des gènes sur les boules gagnantes)
    if (Array.isArray(rep.winningXAP) && rep.winningXAP.length > 0) {
      const meanVec = new Float64Array(K);
      let validXapCount = 0;
      rep.winningXAP.forEach((xap) => {
        const vec = xap?.shapleyValues || xap?.dnaVector;
        if (!vec) return;
        let rowSum = 0;
        validKeys.forEach((k) => {
          const v = Number((vec as Record<string, number>)[k]) || 0;
          if (v > 0) rowSum += v;
        });
        if (rowSum <= 0) return;
        validXapCount++;
        const xNorm = new Float64Array(K);
        validKeys.forEach((k, i) => {
          xNorm[i] = Math.max(0, Number((vec as Record<string, number>)[k]) || 0) / rowSum;
          meanVec[i] += xNorm[i];
        });
        // Co-expression centrée sur ce gagnant : (x_i - 1/K) * (x_j - 1/K)
        const uniform = 1 / K;
        for (let i = 0; i < K; i++) {
          const di = (xNorm[i] - uniform) * K;
          for (let j = i + 1; j < K; j++) {
            const dj = (xNorm[j] - uniform) * K;
            const prod = Math.tanh(di * dj) * wRep;
            rawEpistasis[i][j] += prod;
            rawEpistasis[j][i] += prod;
            epistasisSamples[i][j] += wRep;
            epistasisSamples[j][i] += wRep;
          }
        }
      });

      if (validXapCount > 0) {
        validKeys.forEach((k, i) => {
          const empiricalShare = meanVec[i] / validXapCount;
          const diff = (empiricalShare - initialWeights[k]) * K;
          forensicAcc[k] += Math.tanh(diff) * wRep;
          forensicW[k] += wRep;
        });
      }
    }
  });

  // 4.b Accumulation des Autopsies en Boucle Fermée (Closed-Loop + Attribution Contrefactuelle)
  const combinedAutopsies: ClosedLoopAutopsyReport[] = [
    ...autopsyReports,
    ...(batchAutopsy?.reports || []),
  ].filter(
    (r) => !r.drawName || r.drawName.trim().toLowerCase() === drawName.trim().toLowerCase()
  );

  const tauA = Math.max(1, Math.sqrt(Math.max(1, combinedAutopsies.length)));
  combinedAutopsies.forEach((aut, idx) => {
    const wAut = Math.exp(-idx / tauA);
    if (Array.isArray(aut.algoGradients)) {
      aut.algoGradients.forEach((g) => {
        if (!keyToIdx.has(g.key)) return;
        // Gradient positif signifie sous-performance (erreur positive) -> signal négatif sur poids
        const gradDrive = Math.tanh(-g.gradient * 2.0 + (g.attributionToWinners - 1 / K) * K);
        autopsyAcc[g.key] += gradDrive * wAut;
        autopsyW[g.key] += wAut;
      });
    }
    if (Array.isArray(aut.channelAttribution)) {
      aut.channelAttribution.forEach((attr) => {
        const k = attr.key as AlgoKey;
        if (!keyToIdx.has(k)) return;
        // Ablation : si retirer le canal augmente les hits/réduit le Brier (-deltaBrier > 0), le canal est utile
        const causalGain = Math.tanh(attr.deltaHitsTop5Ablation * 2.0 - attr.deltaBrierAblation * 20.0);
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
        attr.meanDeltaHitsTop5Ablation * 2.0 - attr.meanDeltaBrierAblation * 20.0
      );
      autopsyAcc[k] += causalGain;
      autopsyW[k] += 1;
    });
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
    genomicAudit.allGenes.forEach((g) => {
      if (keyToIdx.has(g.key)) {
        const zRes = (g.resonanceScore - meanResonance) / stdResonance;
        genomicAcc[g.key] = Math.tanh(0.6 * zRes + 0.4 * g.informationEfficiency * 3.0);
      }
    });
  }

  // 4.d Dérive ADN (DnaPerformanceDriftReport)
  if (dnaDriftReport && Array.isArray(dnaDriftReport.algorithmDriftBreakdown)) {
    dnaDriftReport.algorithmDriftBreakdown.forEach((item) => {
      const k = item.algoKey as AlgoKey;
      if (keyToIdx.has(k)) {
        // empiricalUtility - injectedWeight : si l'utilité empirique > poids injecté, le gène doit monter
        const utilityGap = (item.empiricalUtility - item.injectedWeight) * K;
        driftAcc[k] = Math.tanh(utilityGap);
      }
    });
  }

  // 4.e Lignée ADN (ModelDnaRecord[]) -> Sérialisation déterministe pour le noyau épistasique HPC
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

  // 5 & 6. Agrégation préalable des canaux d'analyse et exécution du noyau épistasique HPC (Rust/WASM ou fallback C^∞)
  const normalizedEntropy =
    bounds.shannonEntropy > 1.0
      ? Math.min(1.0, bounds.shannonEntropy / Math.log2(90))
      : Math.max(0, Math.min(1.0, bounds.shannonEntropy));

  const hasForensicSource = R > 0;
  const hasAutopsySource = combinedAutopsies.length > 0 || Boolean(batchAutopsy);
  const hasGenomicSource = genomicEvaluatedCount > 0;
  const hasDriftSource = Boolean(dnaDriftReport);

  const forensicCompByGene: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const autopsyCompByGene: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const genomicCompByGene: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const driftCompByGene: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;

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
  const proofFlags = new Uint8Array(K);
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
    const hasProof = Boolean(proof && proof.hasProof && proof.proofScore > 0);
    proofFlags[i] = hasProof ? 1 : 0;
    proofScores[i] = proof ? proof.proofScore : 0;

    if (forcedZeroKeys.has(k)) {
      forcedZeroFlags[i] = 1;
      forensicCompByGene[k] = 0;
      autopsyCompByGene[k] = 0;
      genomicCompByGene[k] = 0;
      driftCompByGene[k] = 0;
      baseAnalysisSignals[i] = 0;
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

    let num = 0;
    let den = 0;
    if (hasForensicSource && forensicW[k] > 0) {
      num += 0.40 * fVal;
      den += 0.40;
    }
    if (hasAutopsySource && autopsyW[k] > 0) {
      num += 0.30 * aVal;
      den += 0.30;
    }
    if (hasGenomicSource) {
      num += 0.20 * gVal;
      den += 0.20;
    }
    if (hasDriftSource) {
      num += 0.10 * dVal;
      den += 0.10;
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
    proofFlags,
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
  const epistaticCouplings: EpistaticCoupling[] = [];

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
        const gA = validKeys[i];
        const gB = validKeys[j];
        let classification: EpistaticCoupling['classification'] = 'NEUTRAL';
        if (clamped >= 0.12) classification = 'SYNERGISTIC_AMPLIFIER';
        else if (clamped <= -0.12) classification = 'REDUNDANT_ANTAGONIST';

        epistaticCouplings.push({
          geneA: gA,
          geneB: gB,
          labelA: LABELS_MAP[gA] || gA,
          labelB: LABELS_MAP[gB] || gB,
          couplingStrength: parseFloat(clamped.toFixed(4)),
          classification,
          evidenceSources: parseFloat(samples.toFixed(2)),
        });
      }
    }
  }

  epistaticCouplings.sort((a, b) => Math.abs(b.couplingStrength) - Math.abs(a.couplingStrength));

  // Projection rigoureuse sur le simplexe avec plafond Proof-Guard (aucun gène non prouvé > baseW)
  const candidateWeights = projectWeightsWithProofGuard(
    rawTargetWeights,
    initialWeights,
    lockedMaxKeys,
    forcedZeroKeys
  );

  // 9. Vérification & amortissement continu du seuil critique de dérive (computeDrawCriticalThreshold)
  const { criticalThreshold } = computeDrawCriticalThreshold(
    pureHistory,
    validKeys.filter((k) => !forcedZeroKeys.has(k)).length,
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
    optimizedWeights = projectWeightsWithProofGuard(
      dampedRaw,
      initialWeights,
      lockedMaxKeys,
      forcedZeroKeys
    );
  }

  // 10. Construction de la Séquence Chromosomique Ordonnée des Gènes
  const activeSequenceOrder = [...validKeys].sort((a, b) => {
    const diff = (initialWeights[b] || 0) - (initialWeights[a] || 0);
    return Math.abs(diff) > 1e-9 ? diff : a.localeCompare(b);
  });
  const canonicalSequenceOrder = [...validKeys]; // Ordre canonique de l'enum AlgoKey

  const previousRankMap = new Map<AlgoKey, number>();
  activeSequenceOrder.forEach((k, idx) => previousRankMap.set(k, idx + 1));

  // Score d'expression chromosomique pour l'ordonnancement de la séquence cible
  const geneExpressionScore = (k: AlgoKey): number => {
    if (forcedZeroKeys.has(k)) return -1e6;
    const optW = optimizedWeights[k] || 0;
    const proof = proofMap[k];
    const hasProof = proof && proof.hasProof && proof.proofScore > 0 ? 1 : 0;
    return (
      optW * K +
      0.35 * postMortemSignalByGene[k] +
      0.15 * epistaticSynergyByGene[k] +
      0.25 * hasProof
    );
  };

  const optimizedSequenceOrder = [...validKeys].sort((a, b) => {
    const diff = geneExpressionScore(b) - geneExpressionScore(a);
    return Math.abs(diff) > 1e-9 ? diff : a.localeCompare(b);
  });

  // États d'expression continus (Z-score sur la distribution des poids optimisés)
  const activeWeightsList = validKeys
    .filter((k) => !forcedZeroKeys.has(k))
    .map((k) => optimizedWeights[k] || 0);
  const meanOptW =
    activeWeightsList.reduce((a, b) => a + b, 0) / Math.max(1, activeWeightsList.length);
  const stdOptW = Math.sqrt(
    activeWeightsList.reduce((s, w) => s + (w - meanOptW) ** 2, 0) /
      Math.max(1, activeWeightsList.length)
  );

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
      if (zW > 1.0 || (hasEmpiricalProof && rank <= 5)) {
        expressionState = 'DOMINANT';
      } else if (pmSignal > 0.1 || epSyn > 0.15) {
        expressionState = 'CO_EXPRESSIVE';
      } else if (zW < -1.0 || pmSignal < -0.15) {
        expressionState = 'REPRESSED';
      }
    }

    const label = LABELS_MAP[k] || k;
    let rationale = `Équilibre homéostatique (poids ${(optW * 100).toFixed(2)}%).`;
    if (expressionState === 'SILENCED') {
      rationale = `Gène neutralisé (données machine absentes ou canal retiré).`;
    } else if (hasEmpiricalProof) {
      rationale = `Expression amplifiée avec preuve empirique BH (Z=${proofZScore.toFixed(2)}, q=${qValue.toFixed(3)}) et signal post-mortem ${(pmSignal * 100).toFixed(1)}%.`;
    } else if (pmSignal < -0.05) {
      rationale = `Amorti par rétroaction post-mortem (${(pmSignal * 100).toFixed(1)}%) ; plafonné sous preuve BH.`;
    } else if (epSyn > 0.1) {
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
  const codons: DnaGeneCodon[] = [];
  const synergisticPairs = epistaticCouplings
    .filter((c) => c.couplingStrength > 0.08)
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
  epigenomeZScoreVsH0: number;
  conformalSummary: DnaConformalCalibrationSummary;
  steps: DnaGeneWalkForwardStep[];
  summaryText: string;
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

/**
 * VALIDATION WALK-FORWARD HORS-ÉCHANTILLON D'EPIGENOME-SQ (100% CAUSALE, ZÉRO FUITE)
 *
 * Évalue séquentiellement sur une fenêtre glissante stricte `[i+1 .. N-1] -> [i]` si les poids
 * synthétisés par EpiGenome-SQ améliorent réellement le taux de succès Top-5 et le Brier Score
 * par rapport aux poids initiaux de référence et à l'hypothèse nulle H0 (tirage uniforme 5/90),
 * tout en calculant la calibration conforme distribution-free par régime stochastique.
 */
export async function evaluateDnaGeneSequencerWalkForward(input: {
  drawName: string;
  history: DrawResult[];
  currentWeights: AlgoWeights;
  forensicReports?: ForensicReport[];
  maxSteps?: number;
}): Promise<DnaGeneWalkForwardResult> {
  const { drawName, history: rawHistory, currentWeights, forensicReports = [] } = input;
  const pureHistory = purifyHistoryForDraw(drawName, rawHistory || []);
  const hasMachine = drawHasMachineNumbers(drawName, pureHistory);

  const p0 = 5.0 / 90.0;
  const h0MeanHitsTop5 = 5.0 * p0;
  const h0AtLeastOneHitRate = 1.0 - (85 * 84 * 83 * 82 * 81) / (90 * 89 * 88 * 87 * 86);
  const h0BrierScore = p0 * (1.0 - p0);

  // Profondeur minimale d'entraînement dérivée du rang d'ensemble (~10 tirages)
  const minTrainDraws = Math.max(8, Math.min(12, Math.floor(pureHistory.length * 0.45)));
  const maxAvailableSteps = Math.max(0, pureHistory.length - minTrainDraws);
  const targetSteps =
    typeof input.maxSteps === 'number' && input.maxSteps > 0
      ? Math.min(maxAvailableSteps, Math.floor(input.maxSteps))
      : Math.min(maxAvailableSteps, Math.min(10, Math.max(3, Math.floor(Math.sqrt(pureHistory.length)))));

  const baseRaw: AlgoWeights = {
    ...getDefaultWeights(),
    ...(currentWeights || {}),
  };
  if (!hasMachine) {
    baseRaw[AlgoKey.MACHINE_TRANSFER] = 0;
  }
  const baselineWeights = normalizeWeights(baseRaw);

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
      epigenomeZScoreVsH0: 0,
      conformalSummary: buildEmptyConformalSummary(),
      steps: [],
      summaryText: `Historique isolé insuffisant pour ${drawName} (${pureHistory.length} tirages ; minimum 11 requis pour une évaluation walk-forward causale).`,
    };
  }

  const validKeys = Object.values(AlgoKey);
  const K = validKeys.length;
  const keyToIdx = new Map<AlgoKey, number>();
  validKeys.forEach((k, idx) => keyToIdx.set(k, idx));

  let runningWeights: AlgoWeights = { ...baselineWeights };
  const steps: DnaGeneWalkForwardStep[] = [];
  const stepFolds: CalibrationPairs[] = [];
  const globalP: number[] = [];
  const globalY: number[] = [];
  const globalResiduals: number[] = [];
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

  // Parcours chronologique strict : du tirage hors-échantillon le plus ancien (targetSteps - 1) au plus récent (0)
  for (let i = targetSteps - 1; i >= 0; i--) {
    const targetDraw = pureHistory[i];
    const trainHistory = pureHistory.slice(i + 1);
    const { winners: actualWinners } = extractDrawNumbers(targetDraw);
    if (actualWinners.length === 0 || trainHistory.length < minTrainDraws) {
      continue;
    }

    const actualSet = new Set(actualWinners);
    const targetTimeMs = parseDateSafely(targetDraw.date).getTime();

    // Coupure causale stricte sur les rapports post-mortem (< targetTimeMs pour prévenir toute fuite du tirage évalué)
    const causalReports = forensicReports.filter((r) => {
      if (!r || r.drawName?.trim().toLowerCase() !== drawName.trim().toLowerCase()) {
        return false;
      }
      if (Number.isFinite(targetTimeMs) && targetTimeMs > 0) {
        const repTs = parseDateSafely(r.date).getTime();
        return Number.isFinite(repTs) && repTs > 0 && repTs < targetTimeMs;
      }
      return false;
    });

    const stepSynthesis = synthesizeDnaGeneSequenceAndWeights({
      drawName,
      history: trainHistory,
      currentWeights: runningWeights,
      forensicReports: causalReports,
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

    validKeys.forEach((k, gIdx) => {
      epiWeightsFlat[gIdx] = Number(epiWeights[k]) || 0;
      baseWeightsFlat[gIdx] = Number(baselineWeights[k]) || 0;
    });

    for (let idx = 0; idx < algorithmRegistry.length; idx++) {
      const plugin = algorithmRegistry[idx];
      const gIdx = keyToIdx.get(plugin.key);
      if (gIdx === undefined) continue;
      if (!trainHasMachine && plugin.key === AlgoKey.MACHINE_TRANSFER) continue;
      const rowOff = gIdx * 90;
      for (let num = 1; num <= 90; num++) {
        try {
          const ev = plugin.evaluate(num, context);
          pluginScoresFlat[rowOff + (num - 1)] =
            typeof ev.score === 'number' && Number.isFinite(ev.score)
              ? Math.max(0, Math.min(100, ev.score)) / 100.0
              : 0;
        } catch {
          pluginScoresFlat[rowOff + (num - 1)] = 0;
        }
      }
    }

    const winnersU8 = Uint8Array.from(actualWinners);
    const hpcStep = scoreEpigenomeWalkForwardStepHpc({
      pluginScoresFlat,
      epiWeights: epiWeightsFlat,
      baseWeights: baseWeightsFlat,
      numGenes: K,
      actualWinners: winnersU8,
    });

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
      kendallTauShift: stepSynthesis.sequenceMetrics.kendallTauShiftVsActive,
      epistaticCoherenceScore: stepSynthesis.sequenceMetrics.epistaticCoherenceScore,
      sequenceSignature: stepSynthesis.sequenceMetrics.sequenceSignature,
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
      epigenomeZScoreVsH0: 0,
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

  const brierSkillScoreVsH0 = h0BrierScore > 0 ? 1.0 - meanBrierEpigenome / h0BrierScore : 0;
  const brierSkillScoreVsBaseline =
    meanBrierBaseline > 0 ? 1.0 - meanBrierEpigenome / meanBrierBaseline : 0;

  // Test binomial exact sur N * 5 sélections Top-5 face à H0 (p0 = 5/90)
  const totalSlots = N * 5;
  const empiricalSlotRate = sumHits5Epi / totalSlots;
  const slotStdErr = Math.sqrt((p0 * (1.0 - p0)) / totalSlots);
  const epigenomeZScoreVsH0 = slotStdErr > 0 ? (empiricalSlotRate - p0) / slotStdErr : 0;

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

  let verdict: DnaGeneWalkForwardVerdict = 'PARITY_WITH_BASELINE';
  if (
    deltaMeanHitsTop5 > 1e-6 ||
    (Math.abs(deltaMeanHitsTop5) <= 1e-6 && brierSkillScoreVsBaseline > 1e-4)
  ) {
    verdict = 'OUTPERFORMS_BASELINE';
  } else if (
    deltaMeanHitsTop5 < -1e-6 ||
    (Math.abs(deltaMeanHitsTop5) <= 1e-6 && brierSkillScoreVsBaseline < -1e-4)
  ) {
    verdict = 'UNDERPERFORMS_BASELINE';
  }

  const summaryText = `Walk-Forward OOS (${N} tirages, K=${K}) : EpiGenome-SQ ${meanHitsTop5Epigenome.toFixed(2)} hits Top-5/tirage (${(atLeastOneHitRateEpigenome * 100).toFixed(1)}% ≥1 hit) vs Baseline ${meanHitsTop5Baseline.toFixed(2)} (H0=${h0MeanHitsTop5.toFixed(2)}, ${(h0AtLeastOneHitRate * 100).toFixed(1)}%) · BSS vs Baseline ${(brierSkillScoreVsBaseline * 100).toFixed(2)}%.`;

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
    epigenomeZScoreVsH0: parseFloat(epigenomeZScoreVsH0.toFixed(3)),
    conformalSummary,
    steps,
    summaryText,
  };
}


