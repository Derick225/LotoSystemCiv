/**
 * NOYAU ÉPISTASIQUE & GÉNOMIQUE EPIGENOME-SQ (RUST / WASM HPC + FALLBACK C^∞)
 */
import {
  getWasmModuleInstance,
  isLotoEngineWasmReady,
  recordWasmFallback,
} from './wasmRuntime';

export interface EpigenomeMatrixHpcInput {
  rawEpistasisFlat: Float64Array;
  epistasisSamplesFlat: Float64Array;
  lineageWeightsFlat: Float64Array;
  numLineage: number;
  initialWeights: Float64Array;
  armIds: Uint8Array;
  proofFlags: Uint8Array;
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
}

export interface EpigenomeWalkForwardStepHpcOutput {
  hitsTop5Epi: number;
  hitsTop5Base: number;
  hitsTop10Epi: number;
  hitsTop10Base: number;
  brierEpi: number;
  brierBase: number;
  expectedHitsTop5Epi: number;
  expectedHitsTop5Base: number;
  top5Epi: Uint8Array;
  top5Base: Uint8Array;
  epiIncProbs: Float64Array;
  engine: 'RUST_WASM' | 'TS_FALLBACK';
}

/**
 * Calcule la covariance longitudinale de lignée ADN, la matrice épistasique rétrécie K×K,
 * la stabilité des poids, la synergie épistasique et le vecteur cible pré-projection Exponentiated Gradient.
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

  const wasmModuleInstance = getWasmModuleInstance();
  if (isLotoEngineWasmReady() && wasmModuleInstance?.compute_epigenome_matrix_wasm) {
    let res: any = null;
    try {
      res = wasmModuleInstance.compute_epigenome_matrix_wasm(
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
      return {
        numGenes: Number(res.num_genes ?? K),
        epistaticMatrixFlat: new Float64Array(res.epistatic_matrix_flat),
        evidenceSamplesFlat: new Float64Array(res.evidence_samples_flat),
        geneStability: new Float64Array(res.gene_stability),
        epistaticSynergy: new Float64Array(res.epistatic_synergy),
        postMortemSignal: new Float64Array(res.post_mortem_signal),
        rawTargetWeights: new Float64Array(res.raw_target_weights),
        engine: 'RUST_WASM',
      };
    } catch (e) {
      recordWasmFallback('compute_epigenome_matrix_wasm', e);
      console.warn('[WASM] Fallback compute_epigenome_matrix_wasm :', e);
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
  const means = new Float64Array(K);
  const stds = new Float64Array(K);
  const geneStability = new Float64Array(K).fill(1.0);

  if (effectiveLineage >= 2) {
    for (let g = 0; g < K; g++) {
      let sum = 0;
      for (let t = 0; t < effectiveLineage; t++) {
        sum += input.lineageWeightsFlat[t * K + g];
      }
      const mean = sum / effectiveLineage;
      means[g] = mean;
      let variance = 0;
      for (let t = 0; t < effectiveLineage; t++) {
        const d = input.lineageWeightsFlat[t * K + g] - mean;
        variance += d * d;
      }
      const std = Math.sqrt(variance / effectiveLineage);
      stds[g] = std;
      geneStability[g] = Math.exp(-std / uniformShare);
    }
  }

  if (effectiveLineage >= 3) {
    const wLin =
      Math.sqrt(effectiveLineage) / (Math.sqrt(effectiveLineage) + Math.sqrt(K));
    for (let i = 0; i < K; i++) {
      if (stds[i] <= 1e-7) continue;
      for (let j = i + 1; j < K; j++) {
        if (stds[j] <= 1e-7) continue;
        let cov = 0;
        for (let t = 0; t < effectiveLineage; t++) {
          cov +=
            (input.lineageWeightsFlat[t * K + i] - means[i]) *
            (input.lineageWeightsFlat[t * K + j] - means[j]);
        }
        const corr = cov / effectiveLineage / (stds[i] * stds[j]);
        rawEp[i * K + j] += corr * wLin;
        rawEp[j * K + i] += corr * wLin;
        sampEp[i * K + j] += wLin;
        sampEp[j * K + i] += wLin;
      }
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

  for (let i = 0; i < K; i++) {
    if ((input.forcedZeroFlags[i] ?? 0) !== 0) {
      epistaticSynergy[i] = 0;
      postMortemSignal[i] = 0;
      rawTargetWeights[i] = 0;
      continue;
    }

    let epSum = 0;
    const rowOff = i * K;
    for (let j = 0; j < K; j++) {
      if (j === i) continue;
      const partnerW = input.initialWeights[j] ?? uniformShare;
      const partnerExcess = (partnerW - uniformShare) * K;
      epSum += epistaticMatrixFlat[rowOff + j] * Math.tanh(partnerExcess);
    }
    const epSyn = Math.tanh(epSum / sqrtK);
    epistaticSynergy[i] = epSyn;

    const hasProof = (input.proofFlags[i] ?? 0) !== 0;
    const pScore = input.proofScores[i] ?? 0;
    const proofDrive = Math.tanh(pScore / 2.0);
    const baseSig = input.baseAnalysisSignals[i] ?? 0;
    const composite = Math.max(
      -1,
      Math.min(
        1,
        0.65 * baseSig +
          0.2 * (hasProof ? proofDrive : Math.min(0, proofDrive)) +
          0.15 * epSyn
      )
    );
    postMortemSignal[i] = composite;

    let regimeMod = 0;
    if (hasProof) {
      const pStr = Math.tanh(pScore);
      const armId = input.armIds[i] ?? 0;
      if (armId === 1) regimeMod = -0.5 * persistenceBias * pStr;
      else if (armId === 2) regimeMod = 0.5 * complexityBias * pStr;
      else if (armId === 0) regimeMod = 0.35 * (1 - Math.abs(persistenceBias)) * pStr;
      else regimeMod = 0.4 * persistenceBias * pStr;
    }

    const initW = input.initialWeights[i] ?? uniformShare;
    const baseW = initW > 0 ? initW : uniformShare;
    const stabWeight = 0.5 + 0.5 * geneStability[i];
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
      console.warn('[WASM] Fallback compute_sequence_order_metrics_wasm :', e);
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
 * pour un pas hors-échantillon Walk-Forward (hits Top-5/10, Brier, espérance Top-5 & probabilités d'inclusion).
 */
export function scoreEpigenomeWalkForwardStepHpc(
  input: EpigenomeWalkForwardStepHpcInput
): EpigenomeWalkForwardStepHpcOutput {
  const wasmModuleInstance = getWasmModuleInstance();
  if (isLotoEngineWasmReady() && wasmModuleInstance?.score_epigenome_walk_forward_step_wasm) {
    let res: any = null;
    try {
      res = wasmModuleInstance.score_epigenome_walk_forward_step_wasm(
        input.pluginScoresFlat,
        input.epiWeights,
        input.baseWeights,
        input.numGenes,
        input.actualWinners
      );
      return {
        hitsTop5Epi: Number(res.hits_top5_epi) || 0,
        hitsTop5Base: Number(res.hits_top5_base) || 0,
        hitsTop10Epi: Number(res.hits_top10_epi) || 0,
        hitsTop10Base: Number(res.hits_top10_base) || 0,
        brierEpi: Number(res.brier_epi) || 0,
        brierBase: Number(res.brier_base) || 0,
        expectedHitsTop5Epi: Number(res.expected_hits_top5_epi) || 0,
        expectedHitsTop5Base: Number(res.expected_hits_top5_base) || 0,
        top5Epi: new Uint8Array(res.top5_epi),
        top5Base: new Uint8Array(res.top5_base),
        epiIncProbs: new Float64Array(res.epi_inc_probs),
        engine: 'RUST_WASM',
      };
    } catch (e) {
      recordWasmFallback('score_epigenome_walk_forward_step_wasm', e);
      console.warn('[WASM] Fallback score_epigenome_walk_forward_step_wasm :', e);
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

  const TOTAL_NUMBERS = 90;
  const winnerMask = new Uint8Array(TOTAL_NUMBERS + 1);
  for (let i = 0; i < input.actualWinners.length; i++) {
    const w = input.actualWinners[i];
    if (w >= 1 && w <= TOTAL_NUMBERS) winnerMask[w] = 1;
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

  const evaluateEnsemble = (scores: Float64Array) => {
    let sum = 0;
    for (let n = 0; n < TOTAL_NUMBERS; n++) sum += scores[n];
    let brier = 0;
    const incProbs = new Float64Array(TOTAL_NUMBERS);
    const ranked: Array<{ num: number; score: number }> = [];
    for (let n = 0; n < TOTAL_NUMBERS; n++) {
      const prob = sum > 0 ? scores[n] / sum : 1.0 / TOTAL_NUMBERS;
      const pInc = Math.max(0, Math.min(1, 5.0 * prob));
      incProbs[n] = pInc;
      const y = winnerMask[n + 1] ? 1.0 : 0.0;
      const diff = pInc - y;
      brier += diff * diff;
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
    return {
      top5,
      hitsTop5,
      hitsTop10,
      brier: brier / TOTAL_NUMBERS,
      expHits5,
      incProbs,
    };
  };

  const epi = evaluateEnsemble(epiScores);
  const base = evaluateEnsemble(baseScores);

  return {
    hitsTop5Epi: epi.hitsTop5,
    hitsTop5Base: base.hitsTop5,
    hitsTop10Epi: epi.hitsTop10,
    hitsTop10Base: base.hitsTop10,
    brierEpi: epi.brier,
    brierBase: base.brier,
    expectedHitsTop5Epi: epi.expHits5,
    expectedHitsTop5Base: base.expHits5,
    top5Epi: epi.top5,
    top5Base: base.top5,
    epiIncProbs: epi.incProbs,
    engine: 'TS_FALLBACK',
  };
}
