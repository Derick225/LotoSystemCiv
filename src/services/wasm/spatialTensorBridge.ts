/**
 * CALCULS TENSORIELS, GÉOMÉTRIE 90D, CHAMPS SPATIAUX, BARYCENTRE & CORRÉLATION (RUST / WASM + FALLBACK C^∞)
 */
import { wasmMatrixEngine } from './wasmMatrixCore';
import {
  getWasmModuleInstance,
  isLotoEngineWasmReady,
  recordWasmFallback,
} from './wasmRuntime';

/**
 * Produit Scalaire SIMD & Scoring Tensoriel Vectorisé en Rust/WASM
 */
export function dotProductHpc(a: Float64Array | number[], b: Float64Array | number[]): number {
  const aF64 = a instanceof Float64Array ? a : new Float64Array(a);
  const bF64 = b instanceof Float64Array ? b : new Float64Array(b);
  if (isLotoEngineWasmReady() && getWasmModuleInstance()?.dot_product_f64) {
    try {
      return getWasmModuleInstance().dot_product_f64(aF64, bF64);
    } catch {
      // fallback
    }
  }
  const len = Math.min(aF64.length, bF64.length);
  let sum = 0.0;
  for (let i = 0; i < len; i++) sum += aF64[i] * bF64[i];
  return sum;
}

export function tensorScoreHpc(
  featuresFlat: Float64Array | number[],
  weights: Float64Array | number[],
  numNumbers: number = 90,
  numFeatures: number
): Float64Array {
  const feat = featuresFlat instanceof Float64Array ? featuresFlat : new Float64Array(featuresFlat);
  const w = weights instanceof Float64Array ? weights : new Float64Array(weights);

  if (isLotoEngineWasmReady() && getWasmModuleInstance()?.tensor_score_wasm) {
    try {
      return new Float64Array(getWasmModuleInstance().tensor_score_wasm(feat, w, numNumbers, numFeatures));
    } catch {
      // fallback
    }
  }

  const scores = new Float64Array(numNumbers);
  for (let n = 0; n < numNumbers; n++) {
    const row = n * numFeatures;
    let s = 0.0;
    for (let f = 0; f < numFeatures; f++) {
      s += feat[row + f] * (w[f] || 0);
    }
    scores[n] = s;
  }
  return scores;
}

export const computeTensorScoreHpc = tensorScoreHpc;

interface NumberGeoData {
  row: number;
  col: number;
  rev: number;
  mod10: number;
  decade: number;
}

export const NUMBER_GEO_TABLE: NumberGeoData[] = (() => {
  const table: NumberGeoData[] = new Array(91);
  table[0] = { row: 0, col: 0, rev: 0, mod10: 0, decade: 0 };
  for (let n = 1; n <= 90; n++) {
    const idx = n - 1;
    const row = Math.floor(idx / 10);
    const col = idx % 10;
    const mod10 = n % 10;
    const rev = n < 10 ? n : (n % 10) * 10 + Math.floor(n / 10);
    const decade = Math.floor(idx / 10);
    table[n] = { row, col, rev, mod10, decade };
  }
  return table;
})();

/**
 * Calcul Vectorisé Rapide de la Proximité Topologique Continue (1-90 vs Gagnants)
 */
export function computeTopologicalProximityVectorHpc(winners: number[] | Int32Array): Float64Array {
  const result = new Float64Array(91);
  const winLen = winners.length;
  if (winLen === 0) return result;

  for (let num = 1; num <= 90; num++) {
    const pGeo = NUMBER_GEO_TABLE[num];
    let maxSimForWinner = 1e-9;

    for (let i = 0; i < winLen; i++) {
      const w = winners[i];
      if (w < 1 || w > 90) continue;
      if (num === w) {
        maxSimForWinner = 1.0;
        break;
      }
      const wGeo = NUMBER_GEO_TABLE[w];

      const linSim = Math.exp(-0.25 * Math.abs(num - w));
      const dRow = pGeo.row - wGeo.row;
      const dCol = pGeo.col - wGeo.col;
      const gridDist = Math.sqrt(dRow * dRow + dCol * dCol);
      const gridSim = Math.exp(-0.35 * gridDist);
      const mirror91Sim = Math.exp(-0.5 * Math.abs(num + w - 91));
      const mirrorRevSim = Math.exp(-0.5 * Math.abs(pGeo.rev - w));

      const dHarm = Math.abs(pGeo.mod10 - wGeo.mod10);
      const harmonicDist = Math.min(dHarm, 10 - dHarm);
      const harmonicSim = Math.exp(-0.5 * harmonicDist);

      const decadeSim = Math.exp(-0.5 * Math.abs(pGeo.decade - wGeo.decade));

      const sim = Math.max(linSim, gridSim, mirror91Sim, mirrorRevSim, harmonicSim, decadeSim);
      if (sim > maxSimForWinner) {
        maxSimForWinner = sim;
      }
    }
    result[num] = maxSimForWinner;
  }

  return result;
}

export interface SpatialFieldMetricsHpcResult {
  gridDensity: Float64Array;
  gravityPulls: Float64Array;
  barycenterX: number;
  barycenterY: number;
  entropy: number;
  densityThreshold: number;
}

/**
 * Calcul du Champ Spatial Complet en Rust/WASM (Grille, Gravité newtonienne, Barycentre, Entropie)
 */
export function computeSpatialGridHpc(
  flatDraws: Int32Array | number[],
  numDraws: number
): SpatialFieldMetricsHpcResult {
  const flat = flatDraws instanceof Int32Array ? flatDraws : new Int32Array(flatDraws);

  if (isLotoEngineWasmReady() && getWasmModuleInstance()?.compute_spatial_grid_hpc) {
    try {
      const res = getWasmModuleInstance().compute_spatial_grid_hpc(flat, numDraws);
      const out: SpatialFieldMetricsHpcResult = {
        gridDensity: new Float64Array(res.grid_density),
        gravityPulls: new Float64Array(res.gravity_pulls),
        barycenterX: res.barycenter_x,
        barycenterY: res.barycenter_y,
        entropy: res.entropy,
        densityThreshold: res.density_threshold,
      };
      if (typeof res.free === 'function') {
        res.free();
      }
      return out;
    } catch (e) {
      recordWasmFallback('compute_spatial_grid_hpc', e);
      console.warn('[LOTO-ENGINE] WASM compute_spatial_grid_hpc error, using fallback :', e);
    }
  }

  const TOTAL_NUMBERS = 90;
  const k = 5;
  const gridDensity = new Float64Array(TOTAL_NUMBERS + 1);
  const evalDraws = Math.min(numDraws, Math.floor(flat.length / k));

  for (let d = 0; d < evalDraws; d++) {
    for (let c = 0; c < k; c++) {
      const val = flat[d * k + c];
      if (val >= 1 && val <= TOTAL_NUMBERS) {
        gridDensity[val]++;
      }
    }
  }

  let totalDensity = 0.0;
  for (let n = 1; n <= TOTAL_NUMBERS; n++) totalDensity += gridDensity[n];
  const meanDensity = totalDensity / TOTAL_NUMBERS;

  let variance = 0.0;
  for (let n = 1; n <= TOTAL_NUMBERS; n++) {
    const diff = gridDensity[n] - meanDensity;
    variance += diff * diff;
  }
  variance /= TOTAL_NUMBERS;
  const stdDev = Math.sqrt(variance);

  let entropy = 0.0;
  if (totalDensity > 0.0) {
    for (let n = 1; n <= TOTAL_NUMBERS; n++) {
      const v = gridDensity[n];
      if (v > 0.0) {
        const p = v / totalDensity;
        entropy -= p * Math.log2(p);
      }
    }
  }
  const normEntropy = Math.min(1.0, Math.max(0.0, entropy / Math.log2(TOTAL_NUMBERS)));
  const pConfidence = 0.3 + 0.4 * normEntropy;
  const q = pConfidence < 0.5 ? pConfidence : 1.0 - pConfidence;
  const t = Math.sqrt(-2.0 * Math.log(q));
  const z =
    t -
    ((0.010328 * t + 0.802853) * t + 2.515517) /
      (((0.001308 * t + 0.189269) * t + 1.432788) * t + 1.0);
  const signedZ = pConfidence < 0.5 ? -z : z;
  const densityThreshold = meanDensity + signedZ * stdDev;

  let sumX = 0.0;
  let sumY = 0.0;
  let recentCount = 0;
  if (evalDraws > 0) {
    for (let c = 0; c < k; c++) {
      const val = flat[c];
      if (val >= 1 && val <= TOTAL_NUMBERS) {
        const idx = val - 1;
        sumX += idx % 10;
        sumY += Math.floor(idx / 10);
        recentCount++;
      }
    }
  }
  const barycenterX = recentCount > 0 ? sumX / recentCount : 4.5;
  const barycenterY = recentCount > 0 ? sumY / recentCount : 4.0;

  const gravityPulls = new Float64Array(TOTAL_NUMBERS);
  for (let num = 1; num <= TOTAL_NUMBERS; num++) {
    const idx1 = num - 1;
    const x1 = idx1 % 10;
    const y1 = Math.floor(idx1 / 10);
    let pull = 0.0;
    for (let other = 1; other <= TOTAL_NUMBERS; other++) {
      const dVal = gridDensity[other];
      if (dVal > 0.0) {
        const idx2 = other - 1;
        const x2 = idx2 % 10;
        const y2 = Math.floor(idx2 / 10);
        const distSq = (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
        pull += dVal / (1.0 + distSq);
      }
    }
    gravityPulls[num - 1] = pull;
  }

  const outDensity = new Float64Array(TOTAL_NUMBERS);
  for (let i = 1; i <= TOTAL_NUMBERS; i++) outDensity[i - 1] = gridDensity[i];

  return {
    gridDensity: outDensity,
    gravityPulls,
    barycenterX,
    barycenterY,
    entropy: normEntropy,
    densityThreshold,
  };
}

/**
 * Calcul Vectorisé de la Trajectoire de Barycentre
 */
export function computeBarycenterTrajectoryHpc(
  results: { gagnants: number[]; date?: string }[],
  limit: number = 20
): Array<{ x: number; y: number; drawIndex: number; date?: string }> {
  const actualLimit = Math.min(results.length, limit);
  const out: Array<{ x: number; y: number; drawIndex: number; date?: string }> = [];

  for (let idx = 0; idx < actualLimit; idx++) {
    const draw = results[idx];
    const winners = draw?.gagnants || [];
    let sumX = 0.0;
    let sumY = 0.0;
    const len = winners.length || 1;

    for (let c = 0; c < winners.length; c++) {
      const n = winners[c];
      if (n >= 1 && n <= 90) {
        const i = n - 1;
        sumX += i % 10;
        sumY += Math.floor(i / 10);
      }
    }

    out.push({
      x: Math.round((sumX / len) * 100) / 100,
      y: Math.round((sumY / len) * 100) / 100,
      drawIndex: idx,
      date: draw.date,
    });
  }

  return out;
}

/**
 * Corrélation de Pearson Vectorisée Haute Précision (Zéro Allocation)
 */
export function computePearsonCorrelationHpc(
  scoresX: Float64Array | number[],
  scoresY: Float64Array | number[]
): number | null {
  const n = Math.min(scoresX.length, scoresY.length);
  if (n === 0) return null;

  let sumX = 0.0;
  let sumY = 0.0;
  for (let i = 0; i < n; i++) {
    sumX += scoresX[i];
    sumY += scoresY[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0.0;
  let denX = 0.0;
  let denY = 0.0;
  for (let i = 0; i < n; i++) {
    const dx = scoresX[i] - meanX;
    const dy = scoresY[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX <= 1e-12 || denY <= 1e-12) return null;
  const r = num / Math.sqrt(denX * denY);
  return Math.max(-1.0, Math.min(1.0, r));
}

/**
 * Matrice de Corrélation de Pearson Complète Vectorisée
 */
export function computePearsonCorrelationMatrixHpc(
  algoScores: Record<string, number[] | Float64Array>,
  keys: readonly string[]
): { matrix: Record<string, Record<string, number | null>>; average: number } {
  const matrix: Record<string, Record<string, number | null>> = {};
  let sumCorr = 0;
  let countCorr = 0;

  for (const k1 of keys) {
    matrix[k1] = {};
    const s1 = algoScores[k1];
    if (!s1) continue;

    for (const k2 of keys) {
      if (k1 === k2) {
        matrix[k1][k2] = 1.0;
      } else {
        const s2 = algoScores[k2];
        if (!s2) {
          matrix[k1][k2] = null;
          continue;
        }
        const r = computePearsonCorrelationHpc(s1, s2);
        matrix[k1][k2] = r === null ? null : parseFloat(r.toFixed(4));
        if (r !== null) {
          sumCorr += Math.abs(r);
          countCorr++;
        }
      }
    }
  }

  const average = countCorr > 0 ? parseFloat((sumCorr / countCorr).toFixed(4)) : 0;
  return { matrix, average };
}

/**
 * Calcul Vectorisé de Jaccard HPC (Set-Overlap + Régime Inter-Tirages)
 */
export function computeVectorizedJaccardHpc(
  flatHistory: Int32Array | number[],
  drawsCount: number,
  winCols: number = 5,
  mainMax: number = 90
): Float64Array {
  const flat = flatHistory instanceof Int32Array ? flatHistory : new Int32Array(flatHistory);
  return wasmMatrixEngine.vectorizedJaccardAnalysis(flat, drawsCount, winCols, mainMax);
}

/**
 * Fusion Tensorielle 25D Vectorisée HPC (Scoring des 25 canaux)
 */
export function computeTensorFusion25DHpc(
  rawMatrixFlat: Float64Array,
  weights25D: Float64Array,
  medianPerChannel: Float64Array,
  madPerChannel: Float64Array,
  resonanceModulator: Float64Array,
  mainMax: number = 90,
  numChannels: number = 25
): {
  finalScores: Float64Array;
  shapContributions: Float64Array;
} {
  return wasmMatrixEngine.vectorizedTensorFusion25D(
    rawMatrixFlat,
    weights25D,
    medianPerChannel,
    madPerChannel,
    resonanceModulator,
    mainMax,
    numChannels
  );
}
