/**
 * NOYAU ÉPISTASIQUE & GÉNOMIQUE EPIGENOME-SQ (RUST / WASM HPC + FALLBACK C^∞)
 */
import {
  getWasmModuleInstance,
  isLotoEngineWasmReady,
  recordWasmFallback,
  type WasmDisposable,
} from './wasmRuntime';

const TOTAL_NUMBERS = 90;
const TICKET_SIZE = 5;
const PROB_EPSILON = 1e-6;

interface EpigenomeMatrixWasmHandle extends WasmDisposable {
  num_genes?: number;
  epistatic_matrix_flat: Iterable<number>;
  evidence_samples_flat: Iterable<number>;
  gene_stability: Iterable<number>;
  epistatic_synergy: Iterable<number>;
  post_mortem_signal: Iterable<number>;
  raw_target_weights: Iterable<number>;
}

interface EpigenomeWalkForwardStepWasmHandle extends WasmDisposable {
  hits_top5_epi?: number;
  hits_top5_base?: number;
  hits_top10_epi?: number;
  hits_top10_base?: number;
  brier_epi?: number;
  brier_base?: number;
  log_loss_epi?: number;
  log_loss_base?: number;
  auc_epi?: number;
  auc_base?: number;
  expected_hits_top5_epi?: number;
  expected_hits_top5_base?: number;
  top5_epi: Iterable<number>;
  top5_base: Iterable<number>;
  epi_inc_probs: Iterable<number>;
  base_inc_probs?: Iterable<number>;
}

export interface EpigenomeMatrixHpcInput {
  rawEpistasisFlat: Float64Array;
  epistasisSamplesFlat: Float64Array;
  lineageWeightsFlat: Float64Array;
  numLineage: number;
  initialWeights: Float64Array;
  armIds: Uint8Array;
  proofFlags?: Uint8Array;
  proofCredibilities?: Float64Array;
  proofScores: Float64Array;
  baseAnalysisSignals: Float64Array;
  forcedZeroFlags: Uint8Array;
  numGenes: number;
  hurst: number;
  entropyNorm: number;
  totalEvidenceUnits: number;
}

export interface EpigenomeMatrixHpcOutput {
  numGenes: number;
  epistaticMatrixFlat: Float64Array;
  evidenceSamplesFlat: Float64Array;
  geneStability: Float64Array;
  epistaticSynergy: Float64Array;
  postMortemSignal: Float64Array;
  rawTargetWeights: Float64Array;
  engine: 'RUST_WASM' | 'TS_FALLBACK';
}

export interface SequenceOrderMetricsHpcResult {
  kendallTau: number;
  spearmanFootrule: number;
  engine: 'RUST_WASM' | 'TS_FALLBACK';
}

export interface EpigenomeWalkForwardStepHpcInput {
  pluginScoresFlat: Float64Array;
  epiWeights: Float64Array;
  baseWeights: Float64Array;
  numGenes: number;
  actualWinners: Uint8Array;
  tauEpi?: number;
  tauBase?: number;
}

export interface EpigenomeWalkForwardStepHpcOutput {
  hitsTop5Epi: number;
  hitsTop5Base: number;
  hitsTop10Epi: number;
  hitsTop10Base: number;
  brierEpi: number;
  brierBase: number;
  logLossEpi: number;
  logLossBase: number;
  aucEpi: number;
  aucBase: number;
  expectedHitsTop5Epi: number;
  expectedHitsTop5Base: number;
  top5Epi: Uint8Array;
  top5Base: Uint8Array;
  epiIncProbs: Float64Array;
  baseIncProbs: Float64Array;
  engine: 'RUST_WASM' | 'TS_FALLBACK';
}

export interface HedgeFixedShareStepHpcInput {
  currentWeights: Float64Array;
  channelLosses: Float64Array;
  priorWeights: Float64Array;
  forcedZeroFlags: Uint8Array;
  horizonT: number;
}

export interface HedgeFixedShareStepHpcOutput {
  weights: Float64Array;
  eta: number;
  alpha: number;
  engine: 'RUST_WASM' | 'TS_FALLBACK';
}

/**
 * Projection exacte par water-filling (48 étapes de bissection) garantissant
 * q_n ∈ [1e-6, 1 - 1e-6] et Σ q_n = targetSum (= 5 pour 5/90).
 */
export function projectSimplexToCoherentMarginals(
  rawProbs: ArrayLike<number>,
  targetSum: number = TICKET_SIZE
): Float64Array {
  const n = rawProbs.length;
  if (n === 0) return new Float64Array(0);
  const clampedTarget = Math.max(
    n * PROB_EPSILON,
    Math.min(n * (1.0 - PROB_EPSILON), targetSum)
  );
  let safeSum = 0;
  for (let i = 0; i < n; i++) {
    const v = rawProbs[i];
    if (Number.isFinite(v) && v > 0) safeSum += v;
  }
  const uniform = 1.0 / n;
  const base = new Float64Array(n);
  let minB = Infinity;
  let maxB = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = rawProbs[i];
    const p = safeSum > 0 && Number.isFinite(v) && v > 0 ? v / safeSum : uniform;
    base[i] = p;
    if (p < minB) minB = p;
    if (p > maxB) maxB = p;
  }

  let lo = PROB_EPSILON - clampedTarget * maxB - 1.0;
  let hi = 1.0 - PROB_EPSILON - clampedTarget * minB + 1.0;
  for (let iter = 0; iter < 48; iter++) {
    const mid = 0.5 * (lo + hi);
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += Math.max(PROB_EPSILON, Math.min(1.0 - PROB_EPSILON, clampedTarget * base[i] + mid));
    }
    if (s < clampedTarget) lo = mid;
    else hi = mid;
  }

  const shift = 0.5 * (lo + hi);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.max(PROB_EPSILON, Math.min(1.0 - PROB_EPSILON, clampedTarget * base[i] + shift));
  }
  return out;
}

/**
 * Calibration Softmax à température τ suivie d'une projection exacte Σ q_n = 5.
 * Sous τ → +∞ ou scores constants, converge exactement vers 5/90.
 */
export function calibrateScoresSoftmaxMarginals(
  scores: ArrayLike<number>,
  tau: number = 1.0
): Float64Array {
  const n = scores.length;
  if (n === 0) return new Float64Array(0);
  const safeTau = Number.isFinite(tau) && tau > 1e-4 ? tau : 1.0;
  const valid = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = scores[i];
    valid[i] = Number.isFinite(v) ? v : 0;
    sum += valid[i];
  }
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = valid[i] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / n);
  if (std <= 1e-12) {
    return new Float64Array(n).fill(TICKET_SIZE / n);
  }

  let maxZ = -Infinity;
  const zVals = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const z = (valid[i] - mean) / std / safeTau;
    zVals[i] = z;
    if (z > maxZ) maxZ = z;
  }

  const exps = new Float64Array(n);
  let sumExp = 0;
  for (let i = 0; i < n; i++) {
    const e = Math.exp(Math.max(-60.0, Math.min(0.0, zVals[i] - maxZ)));
    exps[i] = e;
    sumExp += e;
  }
  if (sumExp > 0) {
    for (let i = 0; i < n; i++) exps[i] /= sumExp;
  }
  return projectSimplexToCoherentMarginals(exps, TICKET_SIZE);
}

/**
 * AUC Mann-Whitney exacte sur N numéros avec gestion exacte des ex-aequo (rangs moyens).
 */
export function computeRankAuc(
  scores: ArrayLike<number>,
  winnerMask: ArrayLike<boolean | number>
): number {
  const n = scores.length;
  if (n < 2 || winnerMask.length < n) return 0.5;
  let nPos = 0;
  for (let i = 0; i < n; i++) {
    if (winnerMask[i]) nPos++;
  }
  const nNeg = n - nPos;
  if (nPos === 0 || nNeg === 0) return 0.5;

  const idxScores: Array<{ idx: number; score: number }> = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = scores[i];
    idxScores[i] = { idx: i, score: Number.isFinite(v) ? v : 0 };
  }
  idxScores.sort((a, b) => a.score - b.score || a.idx - b.idx);

  const ranks = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && Math.abs(idxScores[j].score - idxScores[i].score) <= 1e-12) {
      j++;
    }
    const avgRank = 0.5 * (i + 1 + j);
    for (let k = i; k < j; k++) {
      ranks[idxScores[k].idx] = avgRank;
    }
    i = j;
  }

  let sumPosRanks = 0;
  for (let idx = 0; idx < n; idx++) {
    if (winnerMask[idx]) sumPosRanks += ranks[idx];
  }
  const u = sumPosRanks - (nPos * (nPos + 1)) * 0.5;
  return Math.max(0, Math.min(1, u / (nPos * nNeg)));
}

function populationStd(vals: number[]): number {
  if (vals.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < vals.length; i++) sum += vals[i];
  const m = sum / vals.length;
  let acc = 0;
  for (let i = 0; i < vals.length; i++) {
    const d = vals[i] - m;
    acc += d * d;
  }
  return Math.sqrt(acc / vals.length);
}

/**
 * Calcule la stabilité de lignée ADN, la matrice épistasique rétrécie K×K (sans circularité),
 * la synergie épistasique et le vecteur cible pré-projection Exponentiated Gradient.
 */
export function computeEpigenomeMatrixHpc(
  input: EpigenomeMatrixHpcInput
): EpigenomeMatrixHpcOutput {
  const K = input.numGenes;
  if (K <= 0) {
    return {
      numGenes: 0,
      epistaticMatrixFlat: new Float64Array(0),
      evidenceSamplesFlat: new Float64Array(0),
      geneStability: new Float64Array(0),
      epistaticSynergy: new Float64Array(0),
      postMortemSignal: new Float64Array(0),
      rawTargetWeights: new Float64Array(0),
      engine: 'TS_FALLBACK',
    };
  }

  const credArray = new Float64Array(K);
  if (input.proofCredibilities) {
    for (let i = 0; i < K; i++) {
      const c = input.proofCredibilities[i] ?? 0;
      credArray[i] = Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0;
    }
  } else if (input.proofFlags) {
    for (let i = 0; i < K; i++) {
      credArray[i] = (input.proofFlags[i] ?? 0) !== 0 ? 1.0 : 0.0;
    }
  }

  const wasmModuleInstance = getWasmModuleInstance();
  if (isLotoEngineWasmReady() && wasmModuleInstance?.compute_epigenome_matrix_continuous_wasm) {
    let res: EpigenomeMatrixWasmHandle | null = null;
    try {
      const wasmRes = wasmModuleInstance.compute_epigenome_matrix_continuous_wasm(
        input.rawEpistasisFlat,
        input.epistasisSamplesFlat,
        input.lineageWeightsFlat,
        input.numLineage,
        input.initialWeights,
        input.armIds,
        credArray,
        input.proofScores,
        input.baseAnalysisSignals,
        input.forcedZeroFlags,
        K,
        input.hurst,
        input.entropyNorm,
        input.totalEvidenceUnits
      );
      res = wasmRes;
      if (!wasmRes) {
        throw new Error('compute_epigenome_matrix_continuous_wasm returned null');
      }
      return {
        numGenes: Number(wasmRes.num_genes ?? K),
        epistaticMatrixFlat: new Float64Array(wasmRes.epistatic_matrix_flat),
        evidenceSamplesFlat: new Float64Array(wasmRes.evidence_samples_flat),
        geneStability: new Float64Array(wasmRes.gene_stability),
        epistaticSynergy: new Float64Array(wasmRes.epistatic_synergy),
        postMortemSignal: new Float64Array(wasmRes.post_mortem_signal),
        rawTargetWeights: new Float64Array(wasmRes.raw_target_weights),
        engine: 'RUST_WASM',
      };
    } catch (e) {
      recordWasmFallback('compute_epigenome_matrix_continuous_wasm', e);
    } finally {
      if (res && typeof res.free === 'function') {
        try {
          res.free();
        } catch {
          // Ignore double-free
        }
      }
    }
  } else if (
    isLotoEngineWasmReady() &&
    !input.proofCredibilities &&
    input.proofFlags &&
    wasmModuleInstance?.compute_epigenome_matrix_wasm
  ) {
    let res: EpigenomeMatrixWasmHandle | null = null;
    try {
      const wasmRes = wasmModuleInstance.compute_epigenome_matrix_wasm(
        input.rawEpistasisFlat,
        input.epistasisSamplesFlat,
        input.lineageWeightsFlat,
        input.numLineage,
        input.initialWeights,
        input.armIds,
        input.proofFlags,
        input.proofScores,
        input.baseAnalysisSignals,
        input.forcedZeroFlags,
        K,
        input.hurst,
        input.entropyNorm,
        input.totalEvidenceUnits
      );
      res = wasmRes;
      if (!wasmRes) {
        throw new Error('compute_epigenome_matrix_wasm returned null');
      }
      return {
        numGenes: Number(wasmRes.num_genes ?? K),
        epistaticMatrixFlat: new Float64Array(wasmRes.epistatic_matrix_flat),
        evidenceSamplesFlat: new Float64Array(wasmRes.evidence_samples_flat),
        geneStability: new Float64Array(wasmRes.gene_stability),
        epistaticSynergy: new Float64Array(wasmRes.epistatic_synergy),
        postMortemSignal: new Float64Array(wasmRes.post_mortem_signal),
        rawTargetWeights: new Float64Array(wasmRes.raw_target_weights),
        engine: 'RUST_WASM',
      };
    } catch (e) {
      recordWasmFallback('compute_epigenome_matrix_wasm', e);
    } finally {
      if (res && typeof res.free === 'function') {
        try {
          res.free();
        } catch {
          // Ignore double-free
        }
      }
    }
  }

  const rawEp = new Float64Array(K * K);
  const sampEp = new Float64Array(K * K);
  const copyLen = Math.min(
    K * K,
    input.rawEpistasisFlat.length,
    input.epistasisSamplesFlat.length
  );
  for (let idx = 0; idx < copyLen; idx++) {
    rawEp[idx] = input.rawEpistasisFlat[idx];
    sampEp[idx] = input.epistasisSamplesFlat[idx];
  }

  const uniformShare = 1.0 / K;
  const effectiveLineage = Math.min(
    input.numLineage,
    Math.floor(input.lineageWeightsFlat.length / K)
  );
  const geneStability = new Float64Array(K).fill(1.0);

  if (effectiveLineage >= 2) {
    for (let g = 0; g < K; g++) {
      let sum = 0;
      for (let t = 0; t < effectiveLineage; t++) {
        sum += input.lineageWeightsFlat[t * K + g];
      }
      const mean = sum / effectiveLineage;
      let variance = 0;
      for (let t = 0; t < effectiveLineage; t++) {
        const d = input.lineageWeightsFlat[t * K + g] - mean;
        variance += d * d;
      }
      const std = Math.sqrt(variance / effectiveLineage);
      geneStability[g] = Math.exp(-std / uniformShare);
    }
  }

  const shrinkagePrior = Math.sqrt(K);
  const epistaticMatrixFlat = new Float64Array(K * K);
  for (let i = 0; i < K; i++) {
    for (let j = i + 1; j < K; j++) {
      const s = sampEp[i * K + j];
      if (s > 0) {
        const meanRaw = rawEp[i * K + j] / s;
        const shrunk = Math.max(-1, Math.min(1, (s / (s + shrinkagePrior)) * meanRaw));
        epistaticMatrixFlat[i * K + j] = shrunk;
        epistaticMatrixFlat[j * K + i] = shrunk;
      }
    }
  }

  const sqrtK = Math.sqrt(K);
  const persistenceBias = Math.tanh(2.5 * (input.hurst - 0.5));
  const complexityBias = Math.tanh(2.0 * (input.entropyNorm - 0.5));
  const eta =
    input.totalEvidenceUnits > 0
      ? 1.0 / Math.sqrt(K * (1.0 + 1.0 / Math.sqrt(input.totalEvidenceUnits)))
      : 1.0 / K;

  const epistaticSynergy = new Float64Array(K);
  const postMortemSignal = new Float64Array(K);
  const rawTargetWeights = new Float64Array(K);
  const proofDriveVec = new Float64Array(K);
  const baseVec = new Float64Array(K);
  const activeBase: number[] = [];
  const activeProof: number[] = [];
  const activeEp: number[] = [];

  for (let i = 0; i < K; i++) {
    if ((input.forcedZeroFlags[i] ?? 0) !== 0) continue;

    let epSum = 0;
    const rowOff = i * K;
    for (let j = 0; j < K; j++) {
      if (j === i || (input.forcedZeroFlags[j] ?? 0) !== 0) continue;
      const partnerP = input.proofScores[j] ?? 0;
      const partnerSig = input.baseAnalysisSignals[j] ?? 0;
      const partnerReliability = 0.5 * Math.tanh(partnerP) + 0.5 * Math.tanh(partnerSig);
      epSum += epistaticMatrixFlat[rowOff + j] * partnerReliability;
    }
    const epSyn = Math.tanh(epSum / sqrtK);
    epistaticSynergy[i] = epSyn;

    const cred = credArray[i] ?? 0;
    const pScore = input.proofScores[i] ?? 0;
    const pDrive = Math.tanh(pScore / 2.0);
    const pSigned = pDrive > 0 ? pDrive * cred : pDrive;
    const bSig = input.baseAnalysisSignals[i] ?? 0;

    proofDriveVec[i] = pSigned;
    baseVec[i] = bSig;
    activeBase.push(bSig);
    activeProof.push(pSigned);
    activeEp.push(epSyn);
  }

  const sdB = populationStd(activeBase);
  const sdP = populationStd(activeProof);
  const sdE = populationStd(activeEp);
  const sdSum = sdB + sdP + sdE;
  const wb = sdSum > 1e-12 ? sdB / sdSum : 1.0 / 3.0;
  const wp = sdSum > 1e-12 ? sdP / sdSum : 1.0 / 3.0;
  const we = sdSum > 1e-12 ? sdE / sdSum : 1.0 / 3.0;
  const stabFloor = 1.0 / sqrtK;

  for (let i = 0; i < K; i++) {
    if ((input.forcedZeroFlags[i] ?? 0) !== 0) {
      epistaticSynergy[i] = 0;
      postMortemSignal[i] = 0;
      rawTargetWeights[i] = 0;
      continue;
    }

    const composite = Math.max(
      -1,
      Math.min(1, wb * baseVec[i] + wp * proofDriveVec[i] + we * epistaticSynergy[i])
    );
    postMortemSignal[i] = composite;

    const cred = credArray[i] ?? 0;
    const pScore = input.proofScores[i] ?? 0;
    const pStr = Math.tanh(pScore) * cred;
    const armScale = 1.0 / sqrtK;
    const armId = input.armIds[i] ?? 0;
    let regimeMod = 0;
    if (armId === 1) regimeMod = -armScale * persistenceBias * pStr;
    else if (armId === 2) regimeMod = armScale * complexityBias * pStr;
    else if (armId === 0) regimeMod = armScale * (1 - Math.abs(persistenceBias)) * pStr;
    else regimeMod = armScale * persistenceBias * pStr;

    const initW = input.initialWeights[i] ?? uniformShare;
    const baseW = initW > 0 ? initW : uniformShare;
    const stabWeight = stabFloor + (1.0 - stabFloor) * geneStability[i];
    const exponent = Math.max(
      -2.5,
      Math.min(2.5, eta * (composite + regimeMod) * stabWeight * sqrtK)
    );
    rawTargetWeights[i] = baseW * Math.exp(exponent);
  }

  return {
    numGenes: K,
    epistaticMatrixFlat,
    evidenceSamplesFlat: sampEp,
    geneStability,
    epistaticSynergy,
    postMortemSignal,
    rawTargetWeights,
    engine: 'TS_FALLBACK',
  };
}

/**
 * Calcule O(K²) les distances normalisées d'ordre de séquence [Kendall-Tau, Spearman Footrule].
 */
export function computeSequenceOrderMetricsHpc(
  seqA: Uint32Array | number[],
  seqB: Uint32Array | number[]
): SequenceOrderMetricsHpcResult {
  const aArr = seqA instanceof Uint32Array ? seqA : Uint32Array.from(seqA);
  const bArr = seqB instanceof Uint32Array ? seqB : Uint32Array.from(seqB);

  const wasmModuleInstance = getWasmModuleInstance();
  if (isLotoEngineWasmReady() && wasmModuleInstance?.compute_sequence_order_metrics_wasm) {
    try {
      const res = wasmModuleInstance.compute_sequence_order_metrics_wasm(aArr, bArr);
      if (res && res.length >= 2) {
        return {
          kendallTau: Number(res[0]) || 0,
          spearmanFootrule: Number(res[1]) || 0,
          engine: 'RUST_WASM',
        };
      }
    } catch (e) {
      recordWasmFallback('compute_sequence_order_metrics_wasm', e);
    }
  }

  const rankA = new Map<number, number>();
  const rankB = new Map<number, number>();
  for (let i = 0; i < aArr.length; i++) rankA.set(aArr[i], i);
  for (let i = 0; i < bArr.length; i++) rankB.set(bArr[i], i);

  const common: number[] = [];
  for (let i = 0; i < aArr.length; i++) {
    if (rankB.has(aArr[i])) common.push(aArr[i]);
  }
  const n = common.length;
  if (n < 2) {
    return { kendallTau: 0, spearmanFootrule: 0, engine: 'TS_FALLBACK' };
  }

  let discordant = 0;
  for (let i = 0; i < n; i++) {
    const rBi = rankB.get(common[i]) ?? 0;
    for (let j = i + 1; j < n; j++) {
      if (rBi > (rankB.get(common[j]) ?? 0)) {
        discordant++;
      }
    }
  }
  const maxPairs = (n * (n - 1)) / 2;
  const kendallTau = maxPairs > 0 ? discordant / maxPairs : 0;

  let absDiffSum = 0;
  for (let i = 0; i < n; i++) {
    const k = common[i];
    absDiffSum += Math.abs((rankA.get(k) ?? 0) - (rankB.get(k) ?? 0));
  }
  const maxFootrule = Math.floor((n * n) / 2);
  const spearmanFootrule = maxFootrule > 0 ? Math.min(1, absDiffSum / maxFootrule) : 0;

  return { kendallTau, spearmanFootrule, engine: 'TS_FALLBACK' };
}

/**
 * Évalue simultanément sur les 90 numéros les ensembles EpiGenome-SQ et Baseline
 * avec probabilités marginales Softmax calibrées à température τ, Log-Loss, Brier et AUC.
 */
export function scoreEpigenomeWalkForwardStepHpc(
  input: EpigenomeWalkForwardStepHpcInput
): EpigenomeWalkForwardStepHpcOutput {
  const tauEpi = Number.isFinite(input.tauEpi) && (input.tauEpi ?? 0) > 0 ? input.tauEpi! : 1.0;
  const tauBase = Number.isFinite(input.tauBase) && (input.tauBase ?? 0) > 0 ? input.tauBase! : 1.0;

  const wasmModuleInstance = getWasmModuleInstance();
  if (
    isLotoEngineWasmReady() &&
    wasmModuleInstance?.score_epigenome_walk_forward_step_calibrated_wasm
  ) {
    let res: EpigenomeWalkForwardStepWasmHandle | null = null;
    try {
      const wasmRes = wasmModuleInstance.score_epigenome_walk_forward_step_calibrated_wasm(
        input.pluginScoresFlat,
        input.epiWeights,
        input.baseWeights,
        input.numGenes,
        input.actualWinners,
        tauEpi,
        tauBase
      );
      res = wasmRes;
      if (!wasmRes) {
        throw new Error('score_epigenome_walk_forward_step_calibrated_wasm returned null');
      }
      return {
        hitsTop5Epi: Number(wasmRes.hits_top5_epi) || 0,
        hitsTop5Base: Number(wasmRes.hits_top5_base) || 0,
        hitsTop10Epi: Number(wasmRes.hits_top10_epi) || 0,
        hitsTop10Base: Number(wasmRes.hits_top10_base) || 0,
        brierEpi: Number(wasmRes.brier_epi) || 0,
        brierBase: Number(wasmRes.brier_base) || 0,
        logLossEpi: Number(wasmRes.log_loss_epi) || 0,
        logLossBase: Number(wasmRes.log_loss_base) || 0,
        aucEpi: Number(wasmRes.auc_epi) || 0.5,
        aucBase: Number(wasmRes.auc_base) || 0.5,
        expectedHitsTop5Epi: Number(wasmRes.expected_hits_top5_epi) || 0,
        expectedHitsTop5Base: Number(wasmRes.expected_hits_top5_base) || 0,
        top5Epi: new Uint8Array(wasmRes.top5_epi),
        top5Base: new Uint8Array(wasmRes.top5_base),
        epiIncProbs: new Float64Array(wasmRes.epi_inc_probs),
        baseIncProbs: wasmRes.base_inc_probs
          ? new Float64Array(wasmRes.base_inc_probs)
          : new Float64Array(TOTAL_NUMBERS).fill(TICKET_SIZE / TOTAL_NUMBERS),
        engine: 'RUST_WASM',
      };
    } catch (e) {
      recordWasmFallback('score_epigenome_walk_forward_step_calibrated_wasm', e);
    } finally {
      if (res && typeof res.free === 'function') {
        try {
          res.free();
        } catch {
          // Ignore double-free
        }
      }
    }
  }

  const winnerMask = new Uint8Array(TOTAL_NUMBERS + 1);
  const winnerMaskZero = new Uint8Array(TOTAL_NUMBERS);
  for (let i = 0; i < input.actualWinners.length; i++) {
    const w = input.actualWinners[i];
    if (w >= 1 && w <= TOTAL_NUMBERS) {
      winnerMask[w] = 1;
      winnerMaskZero[w - 1] = 1;
    }
  }

  const epiScores = new Float64Array(TOTAL_NUMBERS);
  const baseScores = new Float64Array(TOTAL_NUMBERS);
  const maxK = Math.min(
    input.numGenes,
    input.epiWeights.length,
    input.baseWeights.length,
    Math.floor(input.pluginScoresFlat.length / TOTAL_NUMBERS)
  );

  for (let k = 0; k < maxK; k++) {
    const wEpi = input.epiWeights[k];
    const wBase = input.baseWeights[k];
    const rowOff = k * TOTAL_NUMBERS;
    for (let n = 0; n < TOTAL_NUMBERS; n++) {
      const s = input.pluginScoresFlat[rowOff + n];
      epiScores[n] += s * wEpi;
      baseScores[n] += s * wBase;
    }
  }

  const evaluateEnsemble = (scores: Float64Array, tau: number) => {
    const incProbs = calibrateScoresSoftmaxMarginals(scores, tau);
    let brier = 0;
    let logLoss = 0;
    const ranked: Array<{ num: number; score: number }> = [];
    for (let n = 0; n < TOTAL_NUMBERS; n++) {
      const pInc = Math.max(PROB_EPSILON, Math.min(1.0 - PROB_EPSILON, incProbs[n]));
      const y = winnerMask[n + 1] ? 1.0 : 0.0;
      const diff = pInc - y;
      brier += diff * diff;
      logLoss -= y * Math.log(pInc) + (1.0 - y) * Math.log(1.0 - pInc);
      ranked.push({ num: n + 1, score: scores[n] });
    }
    ranked.sort((a, b) => b.score - a.score || a.num - b.num);
    const top5 = new Uint8Array(ranked.slice(0, 5).map((r) => r.num));
    let hitsTop5 = 0;
    let expHits5 = 0;
    for (let i = 0; i < top5.length; i++) {
      const num = top5[i];
      if (winnerMask[num]) hitsTop5++;
      expHits5 += incProbs[num - 1];
    }
    let hitsTop10 = 0;
    for (let i = 0; i < Math.min(10, ranked.length); i++) {
      if (winnerMask[ranked[i].num]) hitsTop10++;
    }
    const auc = computeRankAuc(scores, winnerMaskZero);
    return {
      top5,
      hitsTop5,
      hitsTop10,
      brier: brier / TOTAL_NUMBERS,
      logLoss: logLoss / TOTAL_NUMBERS,
      auc,
      expHits5,
      incProbs,
    };
  };

  const epi = evaluateEnsemble(epiScores, tauEpi);
  const base = evaluateEnsemble(baseScores, tauBase);

  return {
    hitsTop5Epi: epi.hitsTop5,
    hitsTop5Base: base.hitsTop5,
    hitsTop10Epi: epi.hitsTop10,
    hitsTop10Base: base.hitsTop10,
    brierEpi: epi.brier,
    brierBase: base.brier,
    logLossEpi: epi.logLoss,
    logLossBase: base.logLoss,
    aucEpi: epi.auc,
    aucBase: base.auc,
    expectedHitsTop5Epi: epi.expHits5,
    expectedHitsTop5Base: base.expHits5,
    top5Epi: epi.top5,
    top5Base: base.top5,
    epiIncProbs: epi.incProbs,
    baseIncProbs: base.incProbs,
    engine: 'TS_FALLBACK',
  };
}

/**
 * Hedge + Fixed-Share de Herbster & Warmuth (1998) pour régimes non stationnaires :
 * η = sqrt(8 * ln(K) / T), α = 1 / T.
 */
export function computeHedgeFixedShareStepHpc(
  input: HedgeFixedShareStepHpcInput
): HedgeFixedShareStepHpcOutput {
  const K = input.currentWeights.length;
  if (K === 0) {
    return {
      weights: new Float64Array(0),
      eta: 0,
      alpha: 0,
      engine: 'TS_FALLBACK',
    };
  }

  let activeCount = 0;
  for (let i = 0; i < K; i++) {
    if ((input.forcedZeroFlags[i] ?? 0) === 0) activeCount++;
  }
  activeCount = Math.max(1, activeCount);
  const safeT = Math.max(2, Number.isFinite(input.horizonT) ? input.horizonT : 2);
  const eta = Math.sqrt((8.0 * Math.log(Math.max(2, activeCount))) / safeT);
  const alpha = 1.0 / safeT;

  const wasmModuleInstance = getWasmModuleInstance();
  if (isLotoEngineWasmReady() && wasmModuleInstance?.compute_hedge_fixed_share_step_wasm) {
    try {
      const wasmRes = wasmModuleInstance.compute_hedge_fixed_share_step_wasm(
        input.currentWeights,
        input.channelLosses,
        input.priorWeights,
        input.forcedZeroFlags,
        safeT
      );
      if (wasmRes && wasmRes.length === K) {
        return {
          weights: new Float64Array(wasmRes),
          eta,
          alpha,
          engine: 'RUST_WASM',
        };
      }
    } catch (e) {
      recordWasmFallback('compute_hedge_fixed_share_step_wasm', e);
    }
  }

  const post = new Float64Array(K);
  let sumPost = 0;
  for (let i = 0; i < K; i++) {
    if ((input.forcedZeroFlags[i] ?? 0) !== 0) {
      post[i] = 0;
      continue;
    }
    const w =
      Number.isFinite(input.currentWeights[i]) && input.currentWeights[i] > 0
        ? input.currentWeights[i]
        : 1.0 / activeCount;
    const rawLoss = input.channelLosses[i] ?? 0.5;
    const loss = Number.isFinite(rawLoss) ? Math.max(0, Math.min(1, rawLoss)) : 0.5;
    const val = w * Math.exp(-eta * loss);
    post[i] = val;
    sumPost += val;
  }
  if (sumPost > 0) {
    for (let i = 0; i < K; i++) post[i] /= sumPost;
  } else {
    const u = 1.0 / activeCount;
    for (let i = 0; i < K; i++) {
      post[i] = (input.forcedZeroFlags[i] ?? 0) !== 0 ? 0 : u;
    }
  }

  const priorClean = new Float64Array(K);
  let sumPrior = 0;
  for (let i = 0; i < K; i++) {
    if ((input.forcedZeroFlags[i] ?? 0) !== 0) continue;
    const pw = input.priorWeights[i];
    if (Number.isFinite(pw) && pw > 0) {
      priorClean[i] = pw;
      sumPrior += pw;
    }
  }
  if (sumPrior > 0) {
    for (let i = 0; i < K; i++) priorClean[i] /= sumPrior;
  } else {
    const u = 1.0 / activeCount;
    for (let i = 0; i < K; i++) {
      priorClean[i] = (input.forcedZeroFlags[i] ?? 0) !== 0 ? 0 : u;
    }
  }

  const out = new Float64Array(K);
  let sumOut = 0;
  for (let i = 0; i < K; i++) {
    if ((input.forcedZeroFlags[i] ?? 0) !== 0) {
      out[i] = 0;
    } else {
      out[i] = (1.0 - alpha) * post[i] + alpha * priorClean[i];
      sumOut += out[i];
    }
  }
  if (sumOut > 0) {
    for (let i = 0; i < K; i++) out[i] /= sumOut;
  }

  return { weights: out, eta, alpha, engine: 'TS_FALLBACK' };
}
