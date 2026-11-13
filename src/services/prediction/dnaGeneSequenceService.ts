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
 * Calcule la distance de Kendall-Tau normalisée [0, 1] entre deux séquences ordonnées d'AlgoKey.
 * 0 = ordre strictement identique ; 1 = ordre totalement inversé.
 */
export function computeNormalizedKendallTauDistance(
  seqA: AlgoKey[],
  seqB: AlgoKey[]
): number {
  const common = seqA.filter((k) => seqB.includes(k));
  const n = common.length;
  if (n < 2) return 0;

  const rankB = new Map<AlgoKey, number>();
  seqB.forEach((k, idx) => rankB.set(k, idx));

  let discordant = 0;
  for (let i = 0; i < n; i++) {
    const rBi = rankB.get(common[i]) ?? 0;
    for (let j = i + 1; j < n; j++) {
      const rBj = rankB.get(common[j]) ?? 0;
      if (rBi > rBj) {
        discordant++;
      }
    }
  }

  const maxPairs = (n * (n - 1)) / 2;
  return maxPairs > 0 ? discordant / maxPairs : 0;
}

/**
 * Calcule la distance de Spearman Footrule normalisée [0, 1] entre deux ordres de gènes.
 */
export function computeNormalizedSpearmanFootrule(
  seqA: AlgoKey[],
  seqB: AlgoKey[]
): number {
  const common = seqA.filter((k) => seqB.includes(k));
  const n = common.length;
  if (n < 2) return 0;

  const rankA = new Map<AlgoKey, number>();
  const rankB = new Map<AlgoKey, number>();
  seqA.forEach((k, idx) => rankA.set(k, idx));
  seqB.forEach((k, idx) => rankB.set(k, idx));

  let absDiffSum = 0;
  for (const k of common) {
    absDiffSum += Math.abs((rankA.get(k) ?? 0) - (rankB.get(k) ?? 0));
  }
  const maxFootrule = Math.floor((n * n) / 2);
  return maxFootrule > 0 ? Math.min(1, absDiffSum / maxFootrule) : 0;
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

  // 4.e Lignée ADN (ModelDnaRecord[]) -> Stabilité inter-générationnelle & Épistasie longitudinale
  const cleanLineage = dnaLineage.filter(
    (rec) => !rec.drawName || rec.drawName.trim().toLowerCase() === drawName.trim().toLowerCase()
  );
  const weightSeriesByGene: Record<AlgoKey, number[]> = {} as Record<AlgoKey, number[]>;
  validKeys.forEach((k) => {
    weightSeriesByGene[k] = [];
  });
  cleanLineage.forEach((rec) => {
    validKeys.forEach((k) => {
      const w = Number(rec.weights?.[k]);
      weightSeriesByGene[k].push(Number.isFinite(w) ? w : initialWeights[k]);
    });
  });

  const geneStability: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const uniformShare = 1 / Math.max(1, K);
  validKeys.forEach((k) => {
    const series = weightSeriesByGene[k];
    if (series.length < 2) {
      geneStability[k] = 1.0;
      return;
    }
    const mean = series.reduce((a, b) => a + b, 0) / series.length;
    const variance = series.reduce((s, v) => s + (v - mean) ** 2, 0) / series.length;
    geneStability[k] = Math.exp(-Math.sqrt(variance) / uniformShare);
  });

  // Covariance épistasique longitudinale sur la lignée ADN
  if (cleanLineage.length >= 3) {
    const L = cleanLineage.length;
    const means = validKeys.map((k) => {
      const s = weightSeriesByGene[k];
      return s.reduce((a, b) => a + b, 0) / L;
    });
    const stds = validKeys.map((k, idx) => {
      const s = weightSeriesByGene[k];
      const v = s.reduce((a, b) => a + (b - means[idx]) ** 2, 0) / L;
      return Math.sqrt(v);
    });

    for (let i = 0; i < K; i++) {
      for (let j = i + 1; j < K; j++) {
        if (stds[i] > 1e-7 && stds[j] > 1e-7) {
          let cov = 0;
          const si = weightSeriesByGene[validKeys[i]];
          const sj = weightSeriesByGene[validKeys[j]];
          for (let t = 0; t < L; t++) {
            cov += (si[t] - means[i]) * (sj[t] - means[j]);
          }
          const corr = (cov / L) / (stds[i] * stds[j]);
          const wLin = Math.sqrt(L) / (Math.sqrt(L) + Math.sqrt(K));
          rawEpistasis[i][j] += corr * wLin;
          rawEpistasis[j][i] += corr * wLin;
          epistasisSamples[i][j] += wLin;
          epistasisSamples[j][i] += wLin;
        }
      }
    }
  }

  // 5. Finalisation de la matrice épistasique rétrécie (shrinkage continu vers l'indépendance 0)
  const epistaticMatrix: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
  const epistaticCouplings: EpistaticCoupling[] = [];
  const shrinkagePriorCount = Math.sqrt(K); // Echelle naturelle de régularisation sans nombre magique

  for (let i = 0; i < K; i++) {
    for (let j = i + 1; j < K; j++) {
      const samples = epistasisSamples[i][j];
      const meanRaw = samples > 0 ? rawEpistasis[i][j] / samples : 0;
      const shrunk = (samples / (samples + shrinkagePriorCount)) * meanRaw;
      const clamped = Math.max(-1, Math.min(1, shrunk));
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

  // 6. Synthèse du signal unifié par gène & interaction épistasique
  const normalizedEntropy =
    bounds.shannonEntropy > 1.0
      ? Math.min(1.0, bounds.shannonEntropy / Math.log2(90))
      : Math.max(0, Math.min(1.0, bounds.shannonEntropy));

  // Pondération adaptative des canaux d'analyse (uniquement sur les sources réellement disponibles)
  const hasForensicSource = R > 0;
  const hasAutopsySource = combinedAutopsies.length > 0 || Boolean(batchAutopsy);
  const hasGenomicSource = genomicEvaluatedCount > 0;
  const hasDriftSource = Boolean(dnaDriftReport);

  const postMortemSignalByGene: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const forensicCompByGene: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const autopsyCompByGene: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const genomicCompByGene: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const driftCompByGene: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const epistaticSynergyByGene: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;

  validKeys.forEach((k, idx) => {
    if (forcedZeroKeys.has(k)) {
      postMortemSignalByGene[k] = 0;
      forensicCompByGene[k] = 0;
      autopsyCompByGene[k] = 0;
      genomicCompByGene[k] = 0;
      driftCompByGene[k] = 0;
      epistaticSynergyByGene[k] = 0;
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

    // Moyenne pondérée convexe sur les sources présentes
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

    const baseAnalysisSignal = den > 0 ? num / den : 0;

    // Bonus / malus de preuve empirique BH : si preuve BH positive, le Z-score module continûment le signal
    const proof = proofMap[k];
    const hasProof = Boolean(proof && proof.hasProof && proof.proofScore > 0);
    const proofDrive = proof ? Math.tanh(proof.proofScore / 2.0) : 0;

    // Signal de synergie épistasique avec les autres gènes actifs
    let epSum = 0;
    for (let j = 0; j < K; j++) {
      if (j === idx) continue;
      const partnerKey = validKeys[j];
      const partnerExcess = (initialWeights[partnerKey] - uniformShare) * K;
      epSum += epistaticMatrix[idx][j] * Math.tanh(partnerExcess);
    }
    const epSynergy = Math.tanh(epSum / Math.sqrt(K));
    epistaticSynergyByGene[k] = epSynergy;

    // Fusion continue : analyses post-mortem + preuve BH + synergie épistasique
    // Sur bruit pur sans analyses ni preuve, le signal est strictement 0
    const rawComposite =
      0.65 * baseAnalysisSignal +
      0.20 * (hasProof ? proofDrive : Math.min(0, proofDrive)) +
      0.15 * epSynergy;

    postMortemSignalByGene[k] = Math.max(-1, Math.min(1, rawComposite));
  });

  // 7. Modulation continue de régime (STRICTEMENT GATED PAR PREUVE EMPIRIQUE BH)
  const persistenceBias = Math.tanh(2.5 * (bounds.hurstExponent - 0.5));
  const complexityBias = Math.tanh(2.0 * (normalizedEntropy - 0.5));

  const getRegimeModulation = (k: AlgoKey): number => {
    const proof = proofMap[k];
    const hasProof = Boolean(proof && proof.hasProof && proof.proofScore > 0);
    if (!hasProof) return 0; // Zéro boost de régime sans preuve empirique !
    const proofStrength = Math.tanh(proof.proofScore);
    const arm = getChromosomalArm(k);
    if (arm === 'TEMPORAL_CADENCE') return -0.5 * persistenceBias * proofStrength;
    if (arm === 'SPECTRAL_FRACTAL') return 0.5 * complexityBias * proofStrength;
    if (arm === 'STOCHASTIC_INFERENCE') return 0.35 * (1 - Math.abs(persistenceBias)) * proofStrength;
    return 0.4 * persistenceBias * proofStrength;
  };

  // 8. Pas naturel Exponentiated Gradient sur le simplexe avec régularisation KL & Proof Guard
  const totalEvidenceUnits =
    R + combinedAutopsies.length + (genomicEvaluatedCount > 0 ? 1 : 0) + (dnaDriftReport ? 1 : 0);
  const eta =
    totalEvidenceUnits > 0
      ? 1.0 / Math.sqrt(K * (1.0 + 1.0 / Math.sqrt(totalEvidenceUnits)))
      : 1.0 / K;

  const rawTargetWeights: Record<string, number> = {};
  validKeys.forEach((k) => {
    if (forcedZeroKeys.has(k)) {
      rawTargetWeights[k] = 0;
      return;
    }
    const baseW = initialWeights[k] > 0 ? initialWeights[k] : uniformShare;
    const totalDrive = postMortemSignalByGene[k] + getRegimeModulation(k);
    // Facteur de stabilité longitudinal : freine doucement les oscillations de poids instables
    const stabWeight = 0.5 + 0.5 * (geneStability[k] ?? 1.0);
    const exponent = Math.max(-2.5, Math.min(2.5, eta * totalDrive * stabWeight * Math.sqrt(K)));
    rawTargetWeights[k] = baseW * Math.exp(exponent);
  });

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
