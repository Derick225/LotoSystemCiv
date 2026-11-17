/**
 * NOYAUX RUST/WASM : SÉQUENCES D'ÉCARTS, WALK-FORWARD OOS & EXTRACTION DE MOTIFS
 */
import {
  getWasmModuleInstance,
  isLotoEngineWasmReady,
  recordWasmFallback,
} from './wasmRuntime';

export interface GapRangeAnalysisHpcResult {
  totalAnalyzedDraws: number;
  klM1: number;
  klM2: number;
  wassersteinBandwidth: number;
  ticketStoufferZ: number;
  selectionConfidence: number;
  expectedNextMean: number;
  poolBaselineProbs: Float64Array;
  blendedProbs: Float64Array;
  binZScores: Float64Array;
  transitionMatrixOrder1: Float64Array;
  droughtDraws: Int32Array;
  droughtPressure: Float64Array;
  droughtZScores: Float64Array;
  modelWeights: Float64Array;
  ballCurrentGaps: Int32Array;
  ballStoufferZ: Float64Array;
  ballStoufferP: Float64Array;
  ballChannelZFlat: Float64Array;
  ballActiveChannels: Uint8Array;
  topPredictedBins: Uint8Array;
  optimalFive: Uint8Array;
  reserveTwo: Uint8Array;
  trancheQuotas: Uint8Array;
}

export interface GapRangeWalkForwardHpcResult {
  evalCount: number;
  minTrainDraws: number;
  top1SuccessRate: number;
  top1H0ChanceRate: number;
  top3BallCoverageRate: number;
  top3H0ChanceRate: number;
  avgBallsCoveredPerDraw: number;
  avgSelectionHitsPerDraw: number;
  selectionAtLeastOneHitRate: number;
  meanBrierScore: number;
  h0BrierScore: number;
  brierSkillScore: number;
  stepDrawIndices: Int32Array;
  stepPredictedTop3: Uint8Array;
  stepActualCounts: Uint8Array;
  stepOptimalFiveHits: Uint8Array;
  stepBrierScores: Float64Array;
}

export interface PatternMiningHpcResult {
  totalCycles: number;
  completedCyclesCount: number;
  activeCycleIndex: number;
  activeCycleDrawsCount: number;
  overallCycleEntropy: number;
  minPairCyclesThreshold: number;
  activeCycleNumbers: Uint8Array;
  ballCycleCounts: Uint32Array;
  sourceBallCounts: Uint32Array;
  sameDrawPairCounts: Uint32Array;
  pairCycleSupports: Uint32Array;
  pairTuples: Uint32Array;
  pairCycleOffsets: Uint32Array;
  pairCycleIndicesFlat: Uint32Array;
  tripletTuples: Uint32Array;
  tripletCycleOffsets: Uint32Array;
  tripletCycleIndicesFlat: Uint32Array;
  transitionTuples: Uint32Array;
  transitionCycleOffsets: Uint32Array;
  transitionCycleIndicesFlat: Uint32Array;
}

const GAP_BIN_COUNT = 7;
const GAP_BOUNDS_MIN = new Int32Array([0, 1, 4, 8, 15, 25, 40]);
const GAP_BOUNDS_MAX = new Int32Array([0, 3, 7, 14, 24, 39, 0x7fffffff]);
const P_SINGLE_5_90 = 5.0 / 90.0;

function classifyGapFast(gap: number): number {
  const g = gap < 0 ? 0 : gap;
  if (g === 0) return 0;
  if (g <= 3) return 1;
  if (g <= 7) return 2;
  if (g <= 14) return 3;
  if (g <= 24) return 4;
  if (g <= 39) return 5;
  return 6;
}

function normalCdfFast(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const sign = z < 0 ? -1.0 : 1.0;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1.0 / (1.0 + 0.3275911 * x);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
    t;
  const erf = 1.0 - poly * Math.exp(-x * x);
  return Math.max(0.0, Math.min(1.0, 0.5 * (1.0 + sign * erf)));
}

function geometricRangeProbFast(minGap: number, maxGap: number): number {
  const q = 1.0 - P_SINGLE_5_90;
  const pMin = Math.pow(q, Math.max(0, minGap));
  const pMax = maxGap >= 0x7fffffff ? 0.0 : Math.pow(q, Math.max(0, maxGap + 1));
  return Math.max(1e-6, pMin - pMax);
}

function computeGapRangeCoreFallback(
  flat: Int32Array,
  numDraws: number,
  winCols: number
): GapRangeAnalysisHpcResult {
  const cols = Math.max(1, winCols);
  const totalDraws = Math.min(numDraws, Math.floor(flat.length / cols));
  const burnIn = Math.min(20, Math.max(3, Math.floor(totalDraws / 4)));

  const lastSeen = new Int32Array(91).fill(-1);
  const ballExitGaps: number[][] = Array.from({ length: 91 }, () => []);
  const ballTrancheExits = new Uint32Array(91 * GAP_BIN_COUNT);
  const poolOccTotals = new Float64Array(GAP_BIN_COUNT);
  let poolOccSteps = 0;

  const geomPriors = new Float64Array(GAP_BIN_COUNT);
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    geomPriors[b] = geometricRangeProbFast(GAP_BOUNDS_MIN[b], GAP_BOUNDS_MAX[b]);
  }

  interface FpEntry {
    counts: Uint8Array;
    winners: Uint8Array;
    winLen: number;
    dom: number;
    meanGap: number;
    stdGap: number;
    medianGap: number;
    entropy: number;
  }
  const footprints: FpEntry[] = [];

  for (let t = 0; t < totalDraws; t++) {
    const off = t * cols;
    let validCnt = 0;
    const winners = new Uint8Array(Math.min(5, cols));
    for (let c = 0; c < cols; c++) {
      const n = flat[off + c];
      if (n >= 1 && n <= 90) {
        if (validCnt < 5) winners[validCnt] = n;
        validCnt++;
      }
    }
    if (validCnt === 0) continue;

    if (t >= burnIn) {
      for (let num = 1; num <= 90; num++) {
        const prev = lastSeen[num];
        const g = prev === -1 ? t : t - 1 - prev;
        poolOccTotals[classifyGapFast(g)] += 1;
      }
      poolOccSteps++;

      const counts = new Uint8Array(GAP_BIN_COUNT);
      const gapsArr: number[] = [];
      let gSum = 0;
      for (let c = 0; c < cols; c++) {
        const n = flat[off + c];
        if (n >= 1 && n <= 90) {
          const prev = lastSeen[n];
          const g = prev === -1 ? t : t - 1 - prev;
          const bIdx = classifyGapFast(g);
          counts[bIdx]++;
          gSum += g;
          gapsArr.push(g);
          ballExitGaps[n].push(g);
          ballTrancheExits[n * GAP_BIN_COUNT + bIdx]++;
        }
      }
      const cnt = Math.max(1, gapsArr.length);
      const meanG = gSum / cnt;
      let varG = 0;
      for (let i = 0; i < gapsArr.length; i++) {
        const d = gapsArr[i] - meanG;
        varG += d * d;
      }
      const stdG = Math.sqrt(varG / cnt);
      gapsArr.sort((a, b) => a - b);
      const mid = gapsArr.length >> 1;
      const medG =
        gapsArr.length === 0
          ? 0
          : gapsArr.length % 2 === 1
            ? gapsArr[mid]
            : (gapsArr[mid - 1] + gapsArr[mid]) / 2;

      let dom = 1;
      let maxBinScore = -1;
      let ent = 0;
      let nonZeroTot = 0;
      for (let b = 0; b < GAP_BIN_COUNT; b++) nonZeroTot += counts[b];
      for (let b = 0; b < GAP_BIN_COUNT; b++) {
        if (counts[b] > 0) {
          const rarityWeight = counts[b] / Math.max(0.02, geomPriors[b]);
          if (rarityWeight > maxBinScore) {
            maxBinScore = rarityWeight;
            dom = b;
          }
        }
        if (nonZeroTot > 0 && counts[b] > 0) {
          const p = counts[b] / nonZeroTot;
          ent -= p * Math.log(p);
        }
      }
      const maxEnt = Math.log(Math.min(Math.max(1, nonZeroTot), GAP_BIN_COUNT));
      footprints.push({
        counts,
        winners,
        winLen: Math.min(5, validCnt),
        dom,
        meanGap: meanG,
        stdGap: stdG,
        medianGap: medG,
        entropy: maxEnt > 0 ? ent / maxEnt : 0,
      });
    } else {
      for (let c = 0; c < cols; c++) {
        const n = flat[off + c];
        if (n >= 1 && n <= 90) {
          const prev = lastSeen[n];
          if (prev !== -1) {
            const g = t - 1 - prev;
            const bIdx = classifyGapFast(g);
            ballExitGaps[n].push(g);
            ballTrancheExits[n * GAP_BIN_COUNT + bIdx]++;
          }
        }
      }
    }

    for (let c = 0; c < cols; c++) {
      const n = flat[off + c];
      if (n >= 1 && n <= 90) lastSeen[n] = t;
    }
  }

  const nFp = footprints.length;
  const poolBaselineProbs = new Float64Array(GAP_BIN_COUNT);
  const priorStrength = Math.sqrt(Math.max(1, poolOccSteps));
  const occTotal = Math.max(1, poolOccSteps * 90);
  const weightEmp = poolOccSteps / (poolOccSteps + priorStrength);
  let baseSum = 0;
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    const empShare = poolOccSteps > 0 ? poolOccTotals[b] / occTotal : geomPriors[b];
    const blended = Math.max(1e-5, weightEmp * empShare + (1 - weightEmp) * geomPriors[b]);
    poolBaselineProbs[b] = blended;
    baseSum += blended;
  }
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    poolBaselineProbs[b] /= Math.max(1e-9, baseSum);
  }

  const ballCurrentGaps = new Int32Array(91);
  const ballCurrentBin = new Uint8Array(91);
  const poolSizes = new Int32Array(GAP_BIN_COUNT);
  const poolGapSums = new Float64Array(GAP_BIN_COUNT);
  for (let num = 1; num <= 90; num++) {
    const prev = lastSeen[num];
    const g = prev === -1 ? totalDraws : totalDraws - 1 - prev;
    ballCurrentGaps[num] = g;
    const bIdx = classifyGapFast(g);
    ballCurrentBin[num] = bIdx;
    poolSizes[bIdx]++;
    poolGapSums[bIdx] += g;
  }

  const empCounts = new Float64Array(GAP_BIN_COUNT);
  let totalEmpBalls = 0;
  const transCounts1 = new Float64Array(GAP_BIN_COUNT * GAP_BIN_COUNT);
  const transRowTotals1 = new Float64Array(GAP_BIN_COUNT);
  const transCounts2 = new Float64Array(GAP_BIN_COUNT * GAP_BIN_COUNT * GAP_BIN_COUNT);
  const transRowTotals2 = new Float64Array(GAP_BIN_COUNT * GAP_BIN_COUNT);

  for (let i = 0; i < nFp; i++) {
    const fp = footprints[i];
    for (let b = 0; b < GAP_BIN_COUNT; b++) {
      empCounts[b] += fp.counts[b];
      totalEmpBalls += fp.counts[b];
    }
    if (i >= 1) {
      const prevDom = footprints[i - 1].dom;
      const prevShare = footprints[i - 1].counts[prevDom] / 5;
      for (let b = 0; b < GAP_BIN_COUNT; b++) {
        const w = fp.counts[b] * prevShare;
        transCounts1[prevDom * GAP_BIN_COUNT + b] += w;
        transRowTotals1[prevDom] += w;
      }
    }
    if (i >= 2) {
      const k2 = footprints[i - 2].dom * GAP_BIN_COUNT + footprints[i - 1].dom;
      for (let b = 0; b < GAP_BIN_COUNT; b++) {
        transCounts2[k2 * GAP_BIN_COUNT + b] += fp.counts[b];
        transRowTotals2[k2] += fp.counts[b];
      }
    }
  }

  const jeffreysPrior = Math.sqrt(GAP_BIN_COUNT);
  const empDist = new Float64Array(GAP_BIN_COUNT);
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    empDist[b] =
      totalEmpBalls > 0
        ? (empCounts[b] + jeffreysPrior * poolBaselineProbs[b]) /
          (totalEmpBalls + jeffreysPrior)
        : poolBaselineProbs[b];
  }

  const transitionMatrixOrder1 = new Float64Array(GAP_BIN_COUNT * GAP_BIN_COUNT);
  for (let src = 0; src < GAP_BIN_COUNT; src++) {
    const rTot = transRowTotals1[src];
    const denom = Math.max(1e-9, rTot + jeffreysPrior);
    for (let dst = 0; dst < GAP_BIN_COUNT; dst++) {
      const priorMass = jeffreysPrior * poolBaselineProbs[dst];
      transitionMatrixOrder1[src * GAP_BIN_COUNT + dst] =
        (transCounts1[src * GAP_BIN_COUNT + dst] + priorMass) / denom;
    }
  }

  const lastDom = nFp > 0 ? footprints[nFp - 1].dom : 3;
  const markov1Dist = new Float64Array(GAP_BIN_COUNT);
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    markov1Dist[b] = transitionMatrixOrder1[lastDom * GAP_BIN_COUNT + b];
  }

  const hasM2 = nFp >= 2;
  const key2 = hasM2 ? footprints[nFp - 2].dom * GAP_BIN_COUNT + lastDom : 0;
  const markov2Dist = new Float64Array(GAP_BIN_COUNT);
  const r2 = hasM2 ? transRowTotals2[key2] : 0;
  const shrink2 = jeffreysPrior * 5;
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    markov2Dist[b] =
      hasM2 && r2 > 0
        ? (transCounts2[key2 * GAP_BIN_COUNT + b] + shrink2 * markov1Dist[b]) / (r2 + shrink2)
        : markov1Dist[b];
  }

  const droughtDraws = new Int32Array(GAP_BIN_COUNT);
  const droughtPressure = new Float64Array(GAP_BIN_COUNT);
  const droughtZScores = new Float64Array(GAP_BIN_COUNT);
  const renewalRaw = new Float64Array(GAP_BIN_COUNT);
  let renewalSum = 0;

  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    let lastAct = -1;
    const intervals: number[] = [];
    for (let i = 0; i < nFp; i++) {
      if (footprints[i].counts[b] > 0) {
        if (lastAct !== -1) intervals.push(i - lastAct);
        lastAct = i;
      }
    }
    const curD = lastAct === -1 ? nFp : nFp - 1 - lastAct;
    const pHit = 1.0 - Math.pow(Math.max(1e-6, 1.0 - poolBaselineProbs[b]), 5);
    const thMean = 1.0 / Math.max(1e-4, pHit);
    const thVar = (1.0 - pHit) / Math.pow(Math.max(1e-4, pHit), 2);
    const meanIv =
      intervals.length >= 2
        ? intervals.reduce((a, v) => a + v, 0) / intervals.length
        : thMean;
    let varIv = thVar;
    if (intervals.length >= 2) {
      varIv =
        intervals.reduce((a, v) => a + (v - meanIv) * (v - meanIv), 0) /
        intervals.length;
    }
    const stdIv = Math.max(0.5, Math.sqrt(varIv));
    const empMeanDrought = Math.max(0, meanIv - 1);
    const zDr = (curD - empMeanDrought) / stdIv;
    const press = 1.0 / (1.0 + Math.exp(-zDr));
    droughtDraws[b] = curD;
    droughtZScores[b] = zDr;
    droughtPressure[b] = press;
    const availRatio = poolSizes[b] / 90 / Math.max(1e-5, poolBaselineProbs[b]);
    renewalRaw[b] =
      poolBaselineProbs[b] * (0.5 + press) * Math.sqrt(Math.max(0.1, availRatio));
    renewalSum += renewalRaw[b];
  }
  const renewalDist = new Float64Array(GAP_BIN_COUNT);
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    renewalDist[b] = renewalRaw[b] / Math.max(1e-9, renewalSum);
  }

  let w1Bandwidth = 0.15;
  const topMatches: Array<{ idx: number; sim: number }> = [];
  if (nFp >= 6) {
    const lastFp = footprints[nFp - 1];
    const prevFp = footprints[nFp - 2];
    const prev2Fp = footprints[nFp - 3];
    let gM = 0;
    let gS = 0;
    for (let i = 0; i < nFp; i++) {
      gM += footprints[i].meanGap;
      gS += footprints[i].stdGap;
    }
    gM /= nFp;
    gS /= nFp;
    let vM = 0;
    let vS = 0;
    for (let i = 0; i < nFp; i++) {
      vM += (footprints[i].meanGap - gM) ** 2;
      vS += (footprints[i].stdGap - gS) ** 2;
    }
    const scM = Math.max(1.0, Math.sqrt(vM / nFp));
    const scS = Math.max(1.0, Math.sqrt(vS / nFp));

    const w1Norm = (a: Uint8Array, b: Uint8Array): number => {
      let ta = 0;
      let tb = 0;
      for (let i = 0; i < GAP_BIN_COUNT; i++) {
        ta += a[i];
        tb += b[i];
      }
      if (ta <= 0 || tb <= 0) return 1;
      let ca = 0;
      let cb = 0;
      let l1 = 0;
      for (let i = 0; i < GAP_BIN_COUNT - 1; i++) {
        ca += a[i] / ta;
        cb += b[i] / tb;
        l1 += Math.abs(ca - cb);
      }
      return l1 / (GAP_BIN_COUNT - 1);
    };

    const rawDists: Array<{ i: number; w1: number; dna: number; comb: number }> = [];
    for (let i = 2; i < nFp - 2; i++) {
      const w1 =
        (4 * w1Norm(lastFp.counts, footprints[i].counts) +
          2 * w1Norm(prevFp.counts, footprints[i - 1].counts) +
          w1Norm(prev2Fp.counts, footprints[i - 2].counts)) /
        7;
      const dM = Math.abs(lastFp.meanGap - footprints[i].meanGap) / scM;
      const dS = Math.abs(lastFp.stdGap - footprints[i].stdGap) / scS;
      const dMed = Math.abs(lastFp.medianGap - footprints[i].medianGap) / scM;
      const dEnt = Math.abs(lastFp.entropy - footprints[i].entropy);
      const dna = Math.sqrt((dM * dM + dS * dS + dMed * dMed + dEnt * dEnt) / 4);
      rawDists.push({ i, w1, dna, comb: 0.5 * w1 + 0.5 * (dna / (1 + dna)) });
    }
    if (rawDists.length > 0) {
      const sorted = rawDists.map((d) => d.comb).sort((a, b) => a - b);
      w1Bandwidth = Math.max(0.05, sorted[Math.floor(sorted.length / 2)]);
      for (const d of rawDists) {
        const sim = Math.sqrt(Math.exp(-d.w1 / w1Bandwidth) * Math.exp(-d.dna));
        topMatches.push({ idx: d.i, sim });
      }
      topMatches.sort((a, b) => b.sim - a.sim);
      if (topMatches.length > 8) topMatches.length = 8;
    }
  }

  const seqEchoDist = new Float64Array(GAP_BIN_COUNT);
  let echoWSum = 0;
  let echoWSqSum = 0;
  for (const m of topMatches) {
    const nfp = footprints[m.idx + 1];
    for (let b = 0; b < GAP_BIN_COUNT; b++) seqEchoDist[b] += m.sim * (nfp.counts[b] / 5);
    echoWSum += m.sim;
    echoWSqSum += m.sim * m.sim;
  }
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    seqEchoDist[b] = echoWSum > 0 ? seqEchoDist[b] / echoWSum : empDist[b];
  }

  const klDiv = (p: Float64Array, q: Float64Array): number => {
    let s = 0;
    for (let b = 0; b < GAP_BIN_COUNT; b++) {
      const pb = Math.max(1e-9, p[b]);
      const qb = Math.max(1e-9, q[b]);
      s += pb * Math.log(pb / qb);
    }
    return Math.max(0, s);
  };

  const klM1 = klDiv(markov1Dist, empDist);
  const klM2 = klDiv(markov2Dist, markov1Dist);
  const klRen = klDiv(renewalDist, empDist);
  const klEcho = klDiv(seqEchoDist, empDist);

  const n1Eff = transRowTotals1[lastDom] / 5;
  const n2Eff = hasM2 ? transRowTotals2[key2] / 5 : 0;
  const credM1 = n1Eff / (n1Eff + GAP_BIN_COUNT);
  const credM2 = n2Eff / (n2Eff + GAP_BIN_COUNT);
  const credEcho =
    topMatches.length > 0
      ? topMatches[0].sim * (topMatches.length / (topMatches.length + GAP_BIN_COUNT))
      : 0;

  const evEmp = 1 / Math.sqrt(GAP_BIN_COUNT);
  const evM1 = credM1 * (evEmp + Math.sqrt(klM1));
  const evM2 = credM2 * (evEmp * 0.75 + Math.sqrt(klM2));
  const evRen = evEmp * 0.8 + Math.sqrt(klRen);
  const evEcho = credEcho * (evEmp + Math.sqrt(klEcho));
  const evSum = Math.max(1e-9, evEmp + evM1 + evM2 + evRen + evEcho);
  const modelWeights = new Float64Array([
    evEmp / evSum,
    evM1 / evSum,
    evM2 / evSum,
    evRen / evSum,
    evEcho / evSum,
  ]);

  const rawBlended = new Float64Array(GAP_BIN_COUNT);
  let totRaw = 0;
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    const lin =
      modelWeights[0] * empDist[b] +
      modelWeights[1] * markov1Dist[b] +
      modelWeights[2] * markov2Dist[b] +
      modelWeights[3] * renewalDist[b] +
      modelWeights[4] * seqEchoDist[b];
    const avail =
      poolSizes[b] === 0
        ? 0
        : Math.pow(poolSizes[b] / 90 / Math.max(1e-4, poolBaselineProbs[b]), 0.35);
    rawBlended[b] = Math.max(0, lin * avail);
    totRaw += rawBlended[b];
  }
  const blendedProbs = new Float64Array(GAP_BIN_COUNT);
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    blendedProbs[b] = totRaw > 0 ? rawBlended[b] / totRaw : poolBaselineProbs[b];
  }

  const trancheQuotas = new Uint8Array(GAP_BIN_COUNT);
  let maxZ = 0;
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    const p0 = poolBaselineProbs[b];
    const se = Math.sqrt(Math.max(1e-6, (p0 * (1 - p0)) / Math.max(1, n1Eff)));
    const z = Math.abs(blendedProbs[b] - p0) / se;
    if (z > maxZ) maxZ = z;
  }
  const effProbs = maxZ < 1.96 ? poolBaselineProbs : blendedProbs;
  let sumP = 0;
  for (let b = 0; b < GAP_BIN_COUNT; b++) if (poolSizes[b] > 0) sumP += effProbs[b];
  if (sumP > 0) {
    const rems: Array<{ b: number; rem: number; p: number }> = [];
    let alloc = 0;
    for (let b = 0; b < GAP_BIN_COUNT; b++) {
      const cap = poolSizes[b];
      if (cap <= 0) {
        rems.push({ b, rem: -1, p: 0 });
        continue;
      }
      const ex = (effProbs[b] / sumP) * 5;
      const fl = Math.min(cap, Math.floor(ex));
      trancheQuotas[b] = fl;
      alloc += fl;
      rems.push({ b, rem: fl < cap ? ex - fl : -1, p: effProbs[b] });
    }
    rems.sort(
      (a, b) =>
        b.p * Math.max(0, b.rem) - a.p * Math.max(0, a.rem) ||
        b.p - a.p ||
        b.rem - a.rem
    );
    let saf = 0;
    while (alloc < 5 && saf < 20) {
      saf++;
      let prog = false;
      for (const r of rems) {
        if (alloc >= 5) break;
        if (trancheQuotas[r.b] < poolSizes[r.b]) {
          trancheQuotas[r.b]++;
          alloc++;
          prog = true;
        }
      }
      if (!prog) break;
    }
  }

  const binZScores = new Float64Array(GAP_BIN_COUNT);
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    const p0 = poolBaselineProbs[b];
    const se = Math.sqrt(Math.max(1e-9, (p0 * (1 - p0)) / Math.max(1, n1Eff)));
    binZScores[b] = (blendedProbs[b] - p0) / se;
  }

  const dirShrink = Math.sqrt(GAP_BIN_COUNT);
  const bndVar = 5 / 2;
  const seqNEff = echoWSqSum > 0 ? (echoWSum * echoWSum) / echoWSqSum : 0;
  const geomVarH0 = (1 - P_SINGLE_5_90) / (P_SINGLE_5_90 * P_SINGLE_5_90);

  const ballStoufferZ = new Float64Array(91);
  const ballStoufferP = new Float64Array(91).fill(0.5);
  const ballChannelZFlat = new Float64Array(91 * 5);
  const ballActiveChannels = new Uint8Array(91);
  const cands: Array<{ num: number; bin: number; z: number; comp: number }> = [];

  for (let num = 1; num <= 90; num++) {
    const cg = ballCurrentGaps[num];
    const bIdx = ballCurrentBin[num];
    const exits = ballExitGaps[num];
    const m = exits.length;
    const meanG = m > 0 ? exits.reduce((a, v) => a + v, 0) / m : (1 - P_SINGLE_5_90) / P_SINGLE_5_90;
    const varG =
      m >= 2
        ? exits.reduce((a, v) => a + (v - meanG) ** 2, 0) / m
        : geomVarH0;
    const stdG = Math.max(1.5, Math.sqrt(varG));

    let numZT = 0;
    let sumWSq = 0;
    for (let ob = 0; ob < GAP_BIN_COUNT; ob++) {
      const lo = GAP_BOUNDS_MIN[ob];
      const hi = GAP_BOUNDS_MAX[ob];
      const dist = cg < lo ? lo - cg : cg > hi ? cg - hi : 0;
      const w = Math.exp(-(dist * dist) / (2 * bndVar));
      numZT += w * binZScores[ob];
      sumWSq += w * w;
    }
    const zTr = sumWSq > 0 ? numZT / Math.sqrt(sumWSq) : binZScores[bIdx];
    const zDr = droughtZScores[bIdx];

    const bw = Math.max(1.2, 1.06 * stdG * Math.pow(Math.max(1, m), -0.2));
    const wLo = Math.max(0, cg - 1);
    const wHi = cg + Math.max(1, Math.round(bw * 0.75));
    let surv = 0;
    let near = 0;
    for (let i = 0; i < m; i++) {
      if (exits[i] >= wLo) {
        surv++;
        if (exits[i] <= wHi) near++;
      }
    }
    const p0W = Math.min(1 - 1e-6, Math.max(1e-6, 1 - Math.pow(1 - P_SINGLE_5_90, wHi - wLo + 1)));
    const zHa =
      surv > 0
        ? (surv / (surv + dirShrink)) *
          ((near - surv * p0W) / Math.sqrt(Math.max(1e-9, surv * p0W * (1 - p0W))))
        : 0;

    let zAf = 0;
    if (m > 0) {
      const hitsB = ballTrancheExits[num * GAP_BIN_COUNT + bIdx];
      const pS = Math.min(1 - 1e-5, Math.max(1e-5, poolBaselineProbs[bIdx]));
      zAf =
        (m / (m + dirShrink)) *
        ((hitsB - m * pS) / Math.sqrt(Math.max(1e-9, m * pS * (1 - pS))));
    }

    let echoHits = 0;
    for (const tm of topMatches) {
      const nfp = footprints[tm.idx + 1];
      let has = false;
      for (let wi = 0; wi < nfp.winLen; wi++) if (nfp.winners[wi] === num) has = true;
      if (has) echoHits += tm.sim;
    }
    const zEc =
      seqNEff > 0 && echoWSum > 0
        ? (seqNEff / (seqNEff + dirShrink)) *
          ((echoHits / echoWSum - P_SINGLE_5_90) /
            Math.sqrt(Math.max(1e-9, (P_SINGLE_5_90 * (1 - P_SINGLE_5_90)) / seqNEff)))
        : 0;

    let wSum = zTr + zDr;
    let kAct = 2;
    if (surv > 0) {
      wSum += zHa;
      kAct++;
    }
    if (m > 0) {
      wSum += zAf;
      kAct++;
    }
    if (seqNEff > 0) {
      wSum += zEc;
      kAct++;
    }
    const zSt = wSum / Math.sqrt(kAct);
    const pSt = 1 - normalCdfFast(zSt);
    const comp = Math.round(normalCdfFast(zSt) * 1000) / 10;

    ballStoufferZ[num] = Math.round(zSt * 10000) / 10000;
    ballStoufferP[num] = Math.round(pSt * 1000000) / 1000000;
    ballChannelZFlat[num * 5] = zTr;
    ballChannelZFlat[num * 5 + 1] = zDr;
    ballChannelZFlat[num * 5 + 2] = zHa;
    ballChannelZFlat[num * 5 + 3] = zAf;
    ballChannelZFlat[num * 5 + 4] = zEc;
    ballActiveChannels[num] = kAct;
    cands.push({ num, bin: bIdx, z: ballStoufferZ[num], comp });
  }

  cands.sort((a, b) => b.z - a.z || b.comp - a.comp || a.num - b.num);

  const binsPrio = [0, 1, 2, 3, 4, 5, 6].sort(
    (a, b) => binZScores[b] - binZScores[a] || blendedProbs[b] - blendedProbs[a] || a - b
  );
  const topPredictedBins = new Uint8Array([binsPrio[0], binsPrio[1], binsPrio[2]]);

  const selNums: number[] = [];
  const used = new Uint8Array(91);
  const decCnt = new Uint8Array(9);
  const divScale = 1 / Math.sqrt(5);
  for (const bId of binsPrio) {
    let q = trancheQuotas[bId];
    while (q > 0 && selNums.length < 5) {
      let bestN = 0;
      let bestM = -Infinity;
      for (const c of cands) {
        if (c.bin !== bId || used[c.num]) continue;
        const dec = Math.min(8, Math.floor((c.num - 1) / 10));
        let sg = 0;
        for (const sn of selNums) if (ballCurrentGaps[sn] === ballCurrentGaps[c.num]) sg++;
        const marg = c.z - (decCnt[dec] + sg) * divScale;
        if (marg > bestM) {
          bestM = marg;
          bestN = c.num;
        }
      }
      if (bestN === 0) break;
      selNums.push(bestN);
      used[bestN] = 1;
      decCnt[Math.min(8, Math.floor((bestN - 1) / 10))]++;
      q--;
    }
  }
  while (selNums.length < 5) {
    let bestN = 0;
    let bestM = -Infinity;
    for (const c of cands) {
      if (used[c.num]) continue;
      const dec = Math.min(8, Math.floor((c.num - 1) / 10));
      const marg = c.z - decCnt[dec] * divScale;
      if (marg > bestM) {
        bestM = marg;
        bestN = c.num;
      }
    }
    if (bestN === 0) break;
    selNums.push(bestN);
    used[bestN] = 1;
    decCnt[Math.min(8, Math.floor((bestN - 1) / 10))]++;
  }

  const selBins = new Uint8Array(GAP_BIN_COUNT);
  for (const n of selNums) selBins[ballCurrentBin[n]] = 1;
  const resNums: number[] = [];
  while (resNums.length < 2) {
    let bestN = 0;
    let bestU = -Infinity;
    for (const c of cands) {
      if (used[c.num]) continue;
      const u = c.z - (selBins[c.bin] ? divScale : 0);
      if (u > bestU) {
        bestU = u;
        bestN = c.num;
      }
    }
    if (bestN === 0) break;
    resNums.push(bestN);
    used[bestN] = 1;
    selBins[ballCurrentBin[bestN]] = 1;
  }

  selNums.sort((a, b) => a - b);
  const optimalFive = new Uint8Array(5);
  for (let i = 0; i < Math.min(5, selNums.length); i++) optimalFive[i] = selNums[i];
  const reserveTwo = new Uint8Array(2);
  for (let i = 0; i < Math.min(2, resNums.length); i++) reserveTwo[i] = resNums[i];

  let zSum = 0;
  let compSum = 0;
  const realCnt = new Uint8Array(GAP_BIN_COUNT);
  const decUsed = new Uint8Array(9);
  for (const n of selNums) {
    const c = cands.find((x) => x.num === n);
    if (c) {
      zSum += c.z;
      compSum += c.comp;
      realCnt[c.bin]++;
    }
    decUsed[Math.min(8, Math.floor((n - 1) / 10))] = 1;
  }
  const ticketStoufferZ = selNums.length > 0 ? zSum / Math.sqrt(selNums.length) : 0;
  const meanComp = selNums.length > 0 ? compSum / selNums.length : 50;
  let qCa = 0;
  let qCb = 0;
  let qL1 = 0;
  const ta = selNums.length;
  const tb = trancheQuotas.reduce((a, b) => a + b, 0);
  if (ta > 0 && tb > 0) {
    for (let i = 0; i < GAP_BIN_COUNT - 1; i++) {
      qCa += realCnt[i] / ta;
      qCb += trancheQuotas[i] / tb;
      qL1 += Math.abs(qCa - qCb);
    }
  }
  const qFid = Math.max(0, Math.min(100, (1 - qL1 / (GAP_BIN_COUNT - 1)) * 100));
  const decDiv = (decUsed.reduce((a, b) => a + b, 0) / 5) * 100;
  const maxTZ = Math.max(...Array.from(binZScores).map((z) => Math.abs(z)));
  const intCoh = 0.55 * meanComp + 0.25 * qFid + 0.2 * decDiv;
  const zEv = Math.max(0, Math.min(1, (maxTZ - 1.96) / 2.5));
  const selectionConfidence = Math.min(98.5, 25.4 + (Math.min(95, intCoh) - 25.4) * zEv);

  const recN = Math.min(10, nFp);
  let recAvg = 12.5;
  if (recN > 0) {
    let s = 0;
    for (let i = nFp - recN; i < nFp; i++) s += footprints[i].meanGap;
    recAvg = s / recN;
  }
  let expFromBins = 0;
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    const mid =
      GAP_BOUNDS_MAX[b] >= 0x7fffffff
        ? poolSizes[b] > 0
          ? poolGapSums[b] / poolSizes[b]
          : 40 + (1 - P_SINGLE_5_90) / P_SINGLE_5_90
        : (GAP_BOUNDS_MIN[b] + GAP_BOUNDS_MAX[b]) / 2;
    expFromBins += blendedProbs[b] * mid;
  }
  const expectedNextMean = 0.62 * expFromBins + 0.38 * recAvg;

  return {
    totalAnalyzedDraws: nFp,
    klM1,
    klM2,
    wassersteinBandwidth: w1Bandwidth,
    ticketStoufferZ: Math.round(ticketStoufferZ * 10000) / 10000,
    selectionConfidence: Math.round(selectionConfidence * 10) / 10,
    expectedNextMean: Math.round(expectedNextMean * 10) / 10,
    poolBaselineProbs,
    blendedProbs,
    binZScores,
    transitionMatrixOrder1,
    droughtDraws,
    droughtPressure,
    droughtZScores,
    modelWeights,
    ballCurrentGaps,
    ballStoufferZ,
    ballStoufferP,
    ballChannelZFlat,
    ballActiveChannels,
    topPredictedBins,
    optimalFive,
    reserveTwo,
    trancheQuotas,
  };
}

/**
 * 31. Analyse Séquences & Patterns d'Écarts par Tranches (Rust/WASM + Stouffer Z)
 */
export function computeGapRangeAnalysisHpc(
  chronoDrawsFlat: Int32Array | number[],
  numDraws: number,
  winCols: number = 5
): GapRangeAnalysisHpcResult {
  const flat = chronoDrawsFlat instanceof Int32Array ? chronoDrawsFlat : new Int32Array(chronoDrawsFlat);

  const wasmModuleInstance = getWasmModuleInstance();
  if (isLotoEngineWasmReady() && wasmModuleInstance?.compute_gap_range_analysis_wasm) {
    try {
      const res = wasmModuleInstance.compute_gap_range_analysis_wasm(flat, numDraws, winCols);
      const out: GapRangeAnalysisHpcResult = {
        totalAnalyzedDraws: res.total_analyzed_draws,
        klM1: res.kl_m1,
        klM2: res.kl_m2,
        wassersteinBandwidth: res.wasserstein_bandwidth,
        ticketStoufferZ: res.ticket_stouffer_z,
        selectionConfidence: res.selection_confidence,
        expectedNextMean: res.expected_next_mean,
        poolBaselineProbs: new Float64Array(res.pool_baseline_probs),
        blendedProbs: new Float64Array(res.blended_probs),
        binZScores: new Float64Array(res.bin_z_scores),
        transitionMatrixOrder1: new Float64Array(res.transition_matrix_order1),
        droughtDraws: new Int32Array(res.drought_draws),
        droughtPressure: new Float64Array(res.drought_pressure),
        droughtZScores: new Float64Array(res.drought_z_scores),
        modelWeights: new Float64Array(res.model_weights),
        ballCurrentGaps: new Int32Array(res.ball_current_gaps),
        ballStoufferZ: new Float64Array(res.ball_stouffer_z),
        ballStoufferP: new Float64Array(res.ball_stouffer_p),
        ballChannelZFlat: new Float64Array(res.ball_channel_z_flat),
        ballActiveChannels: new Uint8Array(res.ball_active_channels),
        topPredictedBins: new Uint8Array(res.top_predicted_bins),
        optimalFive: new Uint8Array(res.optimal_five),
        reserveTwo: new Uint8Array(res.reserve_two),
        trancheQuotas: new Uint8Array(res.tranche_quotas),
      };
      if (typeof res.free === 'function') res.free();
      return out;
    } catch (e) {
      recordWasmFallback('compute_gap_range_analysis_wasm', e);
      console.warn('[LOTO-ENGINE] WASM compute_gap_range_analysis_wasm error, using fallback :', e);
    }
  }

  return computeGapRangeCoreFallback(flat, numDraws, winCols);
}

/**
 * 32. Évaluation Walk-Forward Strictement Hors-Échantillon (0 Fuite Future)
 */
export function computeGapRangeWalkForwardHpc(
  chronoDrawsFlat: Int32Array | number[],
  numDraws: number,
  winCols: number = 5,
  windowSize: number = 30
): GapRangeWalkForwardHpcResult {
  const flat = chronoDrawsFlat instanceof Int32Array ? chronoDrawsFlat : new Int32Array(chronoDrawsFlat);

  const wasmModuleInstance = getWasmModuleInstance();
  if (isLotoEngineWasmReady() && wasmModuleInstance?.compute_gap_range_walk_forward_wasm) {
    try {
      const res = wasmModuleInstance.compute_gap_range_walk_forward_wasm(flat, numDraws, winCols, windowSize);
      const out: GapRangeWalkForwardHpcResult = {
        evalCount: res.eval_count,
        minTrainDraws: res.min_train_draws,
        top1SuccessRate: res.top1_success_rate,
        top1H0ChanceRate: res.top1_h0_chance_rate,
        top3BallCoverageRate: res.top3_ball_coverage_rate,
        top3H0ChanceRate: res.top3_h0_chance_rate,
        avgBallsCoveredPerDraw: res.avg_balls_covered_per_draw,
        avgSelectionHitsPerDraw: res.avg_selection_hits_per_draw,
        selectionAtLeastOneHitRate: res.selection_at_least_one_hit_rate,
        meanBrierScore: res.mean_brier_score,
        h0BrierScore: res.h0_brier_score,
        brierSkillScore: res.brier_skill_score,
        stepDrawIndices: new Int32Array(res.step_draw_indices),
        stepPredictedTop3: new Uint8Array(res.step_predicted_top3),
        stepActualCounts: new Uint8Array(res.step_actual_counts),
        stepOptimalFiveHits: new Uint8Array(res.step_optimal_five_hits),
        stepBrierScores: new Float64Array(res.step_brier_scores),
      };
      if (typeof res.free === 'function') res.free();
      return out;
    } catch (e) {
      recordWasmFallback('compute_gap_range_walk_forward_wasm', e);
      console.warn('[LOTO-ENGINE] WASM compute_gap_range_walk_forward_wasm error, using fallback :', e);
    }
  }

  const cols = Math.max(1, winCols);
  const totalDraws = Math.min(numDraws, Math.floor(flat.length / cols));
  const minTrain = Math.max(12, Math.min(25, Math.floor(totalDraws / 3)));
  const evalCount =
    totalDraws > minTrain ? Math.min(Math.max(1, windowSize), totalDraws - minTrain) : 0;

  if (evalCount === 0) {
    return {
      evalCount: 0,
      minTrainDraws: minTrain,
      top1SuccessRate: 0,
      top1H0ChanceRate: 0,
      top3BallCoverageRate: 0,
      top3H0ChanceRate: 0,
      avgBallsCoveredPerDraw: 0,
      avgSelectionHitsPerDraw: 0,
      selectionAtLeastOneHitRate: 0,
      meanBrierScore: 0,
      h0BrierScore: 0,
      brierSkillScore: 0,
      stepDrawIndices: new Int32Array(0),
      stepPredictedTop3: new Uint8Array(0),
      stepActualCounts: new Uint8Array(0),
      stepOptimalFiveHits: new Uint8Array(0),
      stepBrierScores: new Float64Array(0),
    };
  }

  const startT = totalDraws - evalCount;
  let top1Hits = 0;
  let top3Covered = 0;
  let totalEvalBalls = 0;
  let sumH0Top1 = 0;
  let sumH0Top3 = 0;
  let sumSelHits = 0;
  let selGe1 = 0;
  let sumBrier = 0;
  let sumH0Brier = 0;

  const stepDrawIndices = new Int32Array(evalCount);
  const stepPredictedTop3 = new Uint8Array(evalCount * 3);
  const stepActualCounts = new Uint8Array(evalCount * GAP_BIN_COUNT);
  const stepOptimalFiveHits = new Uint8Array(evalCount);
  const stepBrierScores = new Float64Array(evalCount);

  for (let s = 0; s < evalCount; s++) {
    const t = startT + s;
    const prefix = flat.subarray(0, t * cols);
    const core = computeGapRangeCoreFallback(prefix, t, cols);

    const tOff = t * cols;
    const actCounts = new Uint8Array(GAP_BIN_COUNT);
    const actBalls: number[] = [];
    for (let c = 0; c < Math.min(5, cols); c++) {
      const bv = flat[tOff + c];
      if (bv >= 1 && bv <= 90) {
        actCounts[classifyGapFast(core.ballCurrentGaps[bv])]++;
        actBalls.push(bv);
      }
    }

    const t0 = core.topPredictedBins[0];
    const t1 = core.topPredictedBins[1];
    const t2 = core.topPredictedBins[2];
    if (actCounts[t0] > 0) top1Hits++;

    const pTop1 = core.poolBaselineProbs[t0];
    const pTop3 =
      core.poolBaselineProbs[t0] + core.poolBaselineProbs[t1] + core.poolBaselineProbs[t2];
    sumH0Top1 += 1 - Math.pow(1 - pTop1, 5);
    sumH0Top3 += pTop3;

    const cov = actCounts[t0] + actCounts[t1] + actCounts[t2];
    top3Covered += cov;
    totalEvalBalls += Math.max(1, actBalls.length);

    let optHits = 0;
    for (let i = 0; i < 5; i++) {
      const cand = core.optimalFive[i];
      if (cand > 0 && actBalls.includes(cand)) optHits++;
    }
    sumSelHits += optHits;
    if (optHits >= 1) selGe1++;

    const denom = Math.max(1, actBalls.length);
    let brier = 0;
    let h0Brier = 0;
    for (let b = 0; b < GAP_BIN_COUNT; b++) {
      const y = actCounts[b] / denom;
      const e = core.blendedProbs[b] - y;
      const e0 = core.poolBaselineProbs[b] - y;
      brier += e * e;
      h0Brier += e0 * e0;
    }
    brier /= GAP_BIN_COUNT;
    h0Brier /= GAP_BIN_COUNT;
    sumBrier += brier;
    sumH0Brier += h0Brier;

    stepDrawIndices[s] = totalDraws - 1 - t;
    stepPredictedTop3[s * 3] = t0;
    stepPredictedTop3[s * 3 + 1] = t1;
    stepPredictedTop3[s * 3 + 2] = t2;
    stepActualCounts.set(actCounts, s * GAP_BIN_COUNT);
    stepOptimalFiveHits[s] = optHits;
    stepBrierScores[s] = brier;
  }

  const meanBrier = sumBrier / evalCount;
  const meanH0Brier = sumH0Brier / evalCount;
  const bss =
    meanH0Brier > 1e-9
      ? Math.max(-1, Math.min(1, 1 - meanBrier / meanH0Brier))
      : 0;

  return {
    evalCount,
    minTrainDraws: minTrain,
    top1SuccessRate: (top1Hits / evalCount) * 100,
    top1H0ChanceRate: (sumH0Top1 / evalCount) * 100,
    top3BallCoverageRate: (top3Covered / Math.max(1, totalEvalBalls)) * 100,
    top3H0ChanceRate: (sumH0Top3 / evalCount) * 100,
    avgBallsCoveredPerDraw: top3Covered / evalCount,
    avgSelectionHitsPerDraw: sumSelHits / evalCount,
    selectionAtLeastOneHitRate: (selGe1 / evalCount) * 100,
    meanBrierScore: meanBrier,
    h0BrierScore: meanH0Brier,
    brierSkillScore: bss,
    stepDrawIndices,
    stepPredictedTop3,
    stepActualCounts,
    stepOptimalFiveHits,
    stepBrierScores,
  };
}

/**
 * 33. Extraction Combinatoire Multi-Cycles HPC (Paires, Triplets Apriori & Transitions Markov)
 * Sans allocation de chaînes de caractères via indexation triangulaire/combinadique O(1).
 */
export function mineCyclePatternsHpc(
  chronoDrawsFlat: Int32Array | number[],
  numDraws: number,
  winCols: number,
  cycleLengthRaw: number,
  minSupportOverride: number = 0,
  includeTransitions: boolean = true
): PatternMiningHpcResult {
  const flat = chronoDrawsFlat instanceof Int32Array ? chronoDrawsFlat : new Int32Array(chronoDrawsFlat);

  const wasmModuleInstance = getWasmModuleInstance();
  if (isLotoEngineWasmReady() && wasmModuleInstance?.mine_cycle_patterns_wasm) {
    try {
      const res = wasmModuleInstance.mine_cycle_patterns_wasm(
        flat,
        numDraws,
        winCols,
        cycleLengthRaw,
        minSupportOverride,
        includeTransitions
      );
      const out: PatternMiningHpcResult = {
        totalCycles: res.total_cycles,
        completedCyclesCount: res.completed_cycles_count,
        activeCycleIndex: res.active_cycle_index,
        activeCycleDrawsCount: res.active_cycle_draws_count,
        overallCycleEntropy: res.overall_cycle_entropy,
        minPairCyclesThreshold: res.min_pair_cycles_threshold,
        activeCycleNumbers: new Uint8Array(res.active_cycle_numbers),
        ballCycleCounts: new Uint32Array(res.ball_cycle_counts),
        sourceBallCounts: new Uint32Array(res.source_ball_counts),
        sameDrawPairCounts: new Uint32Array(res.same_draw_pair_counts),
        pairCycleSupports: new Uint32Array(res.pair_cycle_supports),
        pairTuples: new Uint32Array(res.pair_tuples),
        pairCycleOffsets: new Uint32Array(res.pair_cycle_offsets),
        pairCycleIndicesFlat: new Uint32Array(res.pair_cycle_indices_flat),
        tripletTuples: new Uint32Array(res.triplet_tuples),
        tripletCycleOffsets: new Uint32Array(res.triplet_cycle_offsets),
        tripletCycleIndicesFlat: new Uint32Array(res.triplet_cycle_indices_flat),
        transitionTuples: new Uint32Array(res.transition_tuples),
        transitionCycleOffsets: new Uint32Array(res.transition_cycle_offsets),
        transitionCycleIndicesFlat: new Uint32Array(res.transition_cycle_indices_flat),
      };
      if (typeof res.free === 'function') res.free();
      return out;
    } catch (e) {
      recordWasmFallback('mine_cycle_patterns_wasm', e);
      console.warn('[LOTO-ENGINE] WASM mine_cycle_patterns_wasm error, using fallback :', e);
    }
  }

  const N_BALLS = 90;
  const TOTAL_PAIRS = 4005;
  const TOTAL_TRIPLETS = 117480;
  const cols = Math.max(1, winCols);
  const totalDraws = Math.min(numDraws, Math.floor(flat.length / cols));
  const cycleLength = Math.max(3, Math.min(30, cycleLengthRaw));

  if (totalDraws < cycleLength) {
    return {
      totalCycles: 0,
      completedCyclesCount: 0,
      activeCycleIndex: 0,
      activeCycleDrawsCount: 0,
      overallCycleEntropy: 0,
      minPairCyclesThreshold: 2,
      activeCycleNumbers: new Uint8Array(0),
      ballCycleCounts: new Uint32Array(N_BALLS + 1),
      sourceBallCounts: new Uint32Array(N_BALLS + 1),
      sameDrawPairCounts: new Uint32Array(0),
      pairCycleSupports: new Uint32Array(0),
      pairTuples: new Uint32Array(0),
      pairCycleOffsets: new Uint32Array([0]),
      pairCycleIndicesFlat: new Uint32Array(0),
      tripletTuples: new Uint32Array(0),
      tripletCycleOffsets: new Uint32Array([0]),
      tripletCycleIndicesFlat: new Uint32Array(0),
      transitionTuples: new Uint32Array(0),
      transitionCycleOffsets: new Uint32Array([0]),
      transitionCycleIndicesFlat: new Uint32Array(0),
    };
  }

  const pairIdx = (a: number, b: number): number => {
    const m = a - 1;
    return m * N_BALLS - ((m * (m + 1)) >> 1) + (b - a - 1);
  };
  const tripletIdx = (a: number, b: number, c: number): number => {
    const i = a - 1;
    const j = b - 1;
    const k = c - 1;
    return (
      i +
      ((j * (j > 0 ? j - 1 : 0)) >> 1) +
      Math.floor((k * (k > 0 ? k - 1 : 0) * (k > 1 ? k - 2 : 0)) / 6)
    );
  };
  const comb = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let c = 1;
    for (let i = 1; i <= k; i++) c = (c * (n - (k - i))) / i;
    return c;
  };
  const exactUnion = (k: number): number => {
    const tot = comb(N_BALLS, 5);
    let p = 0;
    for (let j = 0; j <= k; j++) {
      p += (j % 2 === 0 ? 1 : -1) * comb(k, j) * Math.pow(comb(N_BALLS - j, 5) / tot, cycleLength);
    }
    return Math.max(1e-7, Math.min(1 - 1e-7, p));
  };

  const totalCycles = Math.ceil(totalDraws / cycleLength);
  const activeCycleIndex = totalCycles - 1;
  const completedCyclesCount = totalCycles > 1 ? totalCycles - 1 : 1;

  const actStart = activeCycleIndex * cycleLength;
  const actEnd = Math.min(totalDraws, actStart + cycleLength);
  const activeCycleDrawsCount = actEnd - actStart;
  const actSeen = new Uint8Array(N_BALLS + 1);
  for (let d = actStart; d < actEnd; d++) {
    const off = d * cols;
    for (let c = 0; c < cols; c++) {
      const v = flat[off + c];
      if (v >= 1 && v <= N_BALLS) actSeen[v] = 1;
    }
  }
  const actNumsArr: number[] = [];
  for (let n = 1; n <= N_BALLS; n++) if (actSeen[n]) actNumsArr.push(n);
  const activeCycleNumbers = new Uint8Array(actNumsArr);

  const globalBallDrawCounts = new Uint32Array(N_BALLS + 1);
  const ballCycleCounts = new Uint32Array(N_BALLS + 1);
  const sameDrawPairCounts = new Uint32Array(TOTAL_PAIRS);
  const sameDrawTripletCounts = new Uint16Array(TOTAL_TRIPLETS);
  let totalBallHits = 0;

  interface Bucket {
    cycleIdx: number;
    nums: Uint8Array;
    early: Uint8Array;
    mid: Uint8Array;
    late: Uint8Array;
  }
  const buckets: Bucket[] = [];

  for (let c = 0; c < completedCyclesCount; c++) {
    const startIdx = c * cycleLength;
    const endIdx = Math.min(totalDraws, startIdx + cycleLength);
    const drawsInC = endIdx - startIdx;
    const phaseThird = Math.max(1, drawsInC / 3);
    const allF = new Uint8Array(N_BALLS + 1);
    const earlyF = new Uint8Array(N_BALLS + 1);
    const midF = new Uint8Array(N_BALLS + 1);
    const lateF = new Uint8Array(N_BALLS + 1);

    for (let dr = 0; dr < drawsInC; dr++) {
      const off = (startIdx + dr) * cols;
      const dNums: number[] = [];
      for (let col = 0; col < cols; col++) {
        const v = flat[off + col];
        if (v >= 1 && v <= N_BALLS) {
          allF[v] = 1;
          globalBallDrawCounts[v]++;
          totalBallHits++;
          if (dr < phaseThird) earlyF[v] = 1;
          else if (dr < phaseThird * 2) midF[v] = 1;
          else lateF[v] = 1;
          if (!dNums.includes(v)) dNums.push(v);
        }
      }
      dNums.sort((a, b) => a - b);
      for (let i = 0; i < dNums.length; i++) {
        for (let j = i + 1; j < dNums.length; j++) {
          sameDrawPairCounts[pairIdx(dNums[i], dNums[j])]++;
          for (let k = j + 1; k < dNums.length; k++) {
            sameDrawTripletCounts[tripletIdx(dNums[i], dNums[j], dNums[k])]++;
          }
        }
      }
    }

    const sNums: number[] = [];
    for (let n = 1; n <= N_BALLS; n++) {
      if (allF[n]) {
        ballCycleCounts[n]++;
        sNums.push(n);
      }
    }
    buckets.push({ cycleIdx: c, nums: new Uint8Array(sNums), early: earlyF, mid: midF, late: lateF });
  }

  let rawEntropy = 0;
  if (totalBallHits > 0) {
    for (let n = 1; n <= N_BALLS; n++) {
      if (globalBallDrawCounts[n] > 0) {
        const p = globalBallDrawCounts[n] / totalBallHits;
        rawEntropy -= p * Math.log2(p);
      }
    }
  }
  const overallCycleEntropy = parseFloat(
    Math.min(1, Math.max(0, rawEntropy / Math.log2(N_BALLS))).toFixed(4)
  );

  const pairCycles: number[][] = Array.from({ length: TOTAL_PAIRS }, () => []);
  const pairEarlyX2 = new Uint32Array(TOTAL_PAIRS);
  const pairMidX2 = new Uint32Array(TOTAL_PAIRS);
  const pairLateX2 = new Uint32Array(TOTAL_PAIRS);
  const pairA = new Uint8Array(TOTAL_PAIRS);
  const pairB = new Uint8Array(TOTAL_PAIRS);
  for (let a = 1; a <= N_BALLS; a++) {
    for (let b = a + 1; b <= N_BALLS; b++) {
      const pid = pairIdx(a, b);
      pairA[pid] = a;
      pairB[pid] = b;
    }
  }

  for (const cyc of buckets) {
    const nums = cyc.nums;
    for (let i = 0; i < nums.length; i++) {
      const n1 = nums[i];
      for (let j = i + 1; j < nums.length; j++) {
        const n2 = nums[j];
        const pid = pairIdx(n1, n2);
        pairCycles[pid].push(cyc.cycleIdx);
        if (cyc.early[n1] && cyc.early[n2]) pairEarlyX2[pid] += 2;
        else if (cyc.mid[n1] && cyc.mid[n2]) pairMidX2[pid] += 2;
        else if (cyc.late[n1] && cyc.late[n2]) pairLateX2[pid] += 2;
        else {
          if (cyc.early[n1] || cyc.early[n2]) pairEarlyX2[pid] += 1;
          if (cyc.mid[n1] || cyc.mid[n2]) pairMidX2[pid] += 1;
          if (cyc.late[n1] || cyc.late[n2]) pairLateX2[pid] += 1;
        }
      }
    }
  }

  const pairCycleSupports = new Uint32Array(TOTAL_PAIRS);
  for (let pid = 0; pid < TOTAL_PAIRS; pid++) pairCycleSupports[pid] = pairCycles[pid].length;

  const expSingle = exactUnion(1);
  const expPair = exactUnion(2);
  const minPairForTriplet = Math.max(2, Math.ceil(completedCyclesCount * expPair * 1.15));
  const aprioriCands: Array<{ pid: number; score: number }> = [];
  for (let pid = 0; pid < TOTAL_PAIRS; pid++) {
    const sup = pairCycles[pid].length;
    const sc = sameDrawPairCounts[pid];
    if (sup >= minPairForTriplet || sc >= 2) {
      const a = pairA[pid];
      const b = pairB[pid];
      const dice = (2 * sup) / Math.max(1, (ballCycleCounts[a] || 1) + (ballCycleCounts[b] || 1));
      const lift = sup / Math.max(1, completedCyclesCount) / expPair;
      aprioriCands.push({ pid, score: lift * dice + sc * 3.0 });
    }
  }
  aprioriCands.sort((x, y) => y.score - x.score || x.pid - y.pid);
  const freqFlags = new Uint8Array(TOTAL_PAIRS);
  for (let i = 0; i < Math.min(320, aprioriCands.length); i++) freqFlags[aprioriCands[i].pid] = 1;

  const tripletAcc = new Map<
    number,
    { a: number; b: number; c: number; e: number; m: number; l: number; cycs: number[] }
  >();
  for (const cyc of buckets) {
    const nums = cyc.nums;
    const len = nums.length;
    if (len < 3) continue;
    for (let i = 0; i < len - 2; i++) {
      const n1 = nums[i];
      for (let j = i + 1; j < len - 1; j++) {
        const n2 = nums[j];
        const f12 = freqFlags[pairIdx(n1, n2)] === 1;
        for (let k = j + 1; k < len; k++) {
          const n3 = nums[k];
          const tid = tripletIdx(n1, n2, n3);
          const hasSd = sameDrawTripletCounts[tid] >= 1;
          if (!hasSd && (!f12 || !freqFlags[pairIdx(n1, n3)] || !freqFlags[pairIdx(n2, n3)])) {
            continue;
          }
          let entry = tripletAcc.get(tid);
          if (!entry) {
            entry = { a: n1, b: n2, c: n3, e: 0, m: 0, l: 0, cycs: [] };
            tripletAcc.set(tid, entry);
          }
          entry.cycs.push(cyc.cycleIdx);
          entry.e += cyc.early[n1] + cyc.early[n2] + cyc.early[n3];
          entry.m += cyc.mid[n1] + cyc.mid[n2] + cyc.mid[n3];
          entry.l += cyc.late[n1] + cyc.late[n2] + cyc.late[n3];
        }
      }
    }
  }

  const minPairCyclesThreshold =
    minSupportOverride > 0
      ? minSupportOverride
      : Math.max(2, Math.floor(completedCyclesCount * expPair * 0.85));

  const pairTuplesArr: number[] = [];
  const pairOffsetsArr: number[] = [0];
  const pairCycsFlat: number[] = [];
  for (let pid = 0; pid < TOTAL_PAIRS; pid++) {
    const cycs = pairCycles[pid];
    const sc = sameDrawPairCounts[pid];
    if (cycs.length >= minPairCyclesThreshold || sc >= 2) {
      pairTuplesArr.push(pairA[pid], pairB[pid], sc, pairEarlyX2[pid], pairMidX2[pid], pairLateX2[pid]);
      for (const cIdx of cycs) pairCycsFlat.push(cIdx);
      pairOffsetsArr.push(pairCycsFlat.length);
    }
  }

  const tripletTuplesArr: number[] = [];
  const tripletOffsetsArr: number[] = [0];
  const tripletCycsFlat: number[] = [];
  const sortedTids = Array.from(tripletAcc.keys()).sort((a, b) => a - b);
  for (const tid of sortedTids) {
    const acc = tripletAcc.get(tid)!;
    const sc = sameDrawTripletCounts[tid];
    if (acc.cycs.length >= 2 || sc >= 1) {
      tripletTuplesArr.push(acc.a, acc.b, acc.c, sc, acc.e, acc.m, acc.l);
      for (const cIdx of acc.cycs) tripletCycsFlat.push(cIdx);
      tripletOffsetsArr.push(tripletCycsFlat.length);
    }
  }

  const sourceBallCounts = new Uint32Array(N_BALLS + 1);
  const srcLim = Math.max(1, completedCyclesCount - 1);
  for (let c = 0; c < Math.min(srcLim, buckets.length); c++) {
    for (const n of buckets[c].nums) sourceBallCounts[n]++;
  }

  const transTuplesArr: number[] = [];
  const transOffsetsArr: number[] = [0];
  const transCycsFlat: number[] = [];
  if (includeTransitions && buckets.length >= 2) {
    const bayesPrior = Math.sqrt(Math.max(1, completedCyclesCount));
    const smoothProb = new Float64Array(N_BALLS + 1);
    for (let n = 1; n <= N_BALLS; n++) {
      smoothProb[n] = (ballCycleCounts[n] + bayesPrior * expSingle) / (completedCyclesCount + bayesPrior);
    }
    const transCycs: number[][] = Array.from({ length: N_BALLS * N_BALLS }, () => []);
    const trE = new Uint32Array(N_BALLS * N_BALLS);
    const trM = new Uint32Array(N_BALLS * N_BALLS);
    const trL = new Uint32Array(N_BALLS * N_BALLS);
    for (let c = 0; c < buckets.length - 1; c++) {
      const curr = buckets[c];
      const next = buckets[c + 1];
      for (const src of curr.nums) {
        for (const tgt of next.nums) {
          if (src !== tgt) {
            const eid = (src - 1) * N_BALLS + (tgt - 1);
            transCycs[eid].push(next.cycleIdx);
            if (next.early[tgt]) trE[eid]++;
            if (next.mid[tgt]) trM[eid]++;
            if (next.late[tgt]) trL[eid]++;
          }
        }
      }
    }
    for (let src = 1; src <= N_BALLS; src++) {
      const srcTot = Math.max(1, sourceBallCounts[src]);
      for (let tgt = 1; tgt <= N_BALLS; tgt++) {
        if (src === tgt) continue;
        const eid = (src - 1) * N_BALLS + (tgt - 1);
        const transitions = transCycs[eid].length;
        if (transitions < 2) continue;
        const targMarg = smoothProb[tgt];
        const smoothedTr = (transitions + bayesPrior * targMarg) / (srcTot + bayesPrior);
        const lift = targMarg > 0 ? smoothedTr / targMarg : 1.0;
        const minTr = Math.max(2, Math.floor(srcTot * targMarg * 1.15));
        if (transitions >= minTr && lift > 1.08) {
          transTuplesArr.push(src, tgt, trE[eid], trM[eid], trL[eid]);
          for (const cIdx of transCycs[eid]) transCycsFlat.push(cIdx);
          transOffsetsArr.push(transCycsFlat.length);
        }
      }
    }
  }

  return {
    totalCycles,
    completedCyclesCount,
    activeCycleIndex,
    activeCycleDrawsCount,
    overallCycleEntropy,
    minPairCyclesThreshold,
    activeCycleNumbers,
    ballCycleCounts,
    sourceBallCounts,
    sameDrawPairCounts,
    pairCycleSupports,
    pairTuples: new Uint32Array(pairTuplesArr),
    pairCycleOffsets: new Uint32Array(pairOffsetsArr),
    pairCycleIndicesFlat: new Uint32Array(pairCycsFlat),
    tripletTuples: new Uint32Array(tripletTuplesArr),
    tripletCycleOffsets: new Uint32Array(tripletOffsetsArr),
    tripletCycleIndicesFlat: new Uint32Array(tripletCycsFlat),
    transitionTuples: new Uint32Array(transTuplesArr),
    transitionCycleOffsets: new Uint32Array(transOffsetsArr),
    transitionCycleIndicesFlat: new Uint32Array(transCycsFlat),
  };
}
