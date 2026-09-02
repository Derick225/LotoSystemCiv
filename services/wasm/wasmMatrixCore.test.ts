import { describe, it, expect } from 'vitest';
import { wasmMatrixEngine } from './wasmMatrixCore';

describe('WasmMatrixEngine', () => {
  it('computes dotProduct correctly', () => {
    const v1 = new Float64Array([1, 2, 3, 4, 5]);
    const v2 = new Float64Array([2, 0, 1, -1, 3]);
    // 1*2 + 2*0 + 3*1 + 4*-1 + 5*3 = 2 + 0 + 3 - 4 + 15 = 16
    const res = wasmMatrixEngine.dotProduct(v1, v2);
    expect(res).toBe(16);
  });

  it('computes matrix multiplication matMul correctly', () => {
    // 2x2 * 2x2
    const A = new Float64Array([1, 2, 3, 4]);
    const B = new Float64Array([2, 0, 1, 2]);
    // C[0,0] = 1*2 + 2*1 = 4
    // C[0,1] = 1*0 + 2*2 = 4
    // C[1,0] = 3*2 + 4*1 = 10
    // C[1,1] = 3*0 + 4*2 = 8
    const C = wasmMatrixEngine.matMul(A, B, 2, 2, 2);
    expect(Array.from(C)).toEqual([4, 4, 10, 8]);
  });

  it('computes covariance matrix correctly', () => {
    // 3 samples, 2 features
    const data = new Float64Array([
      1, 10,
      2, 20,
      3, 30
    ]);
    const cov = wasmMatrixEngine.covarianceMatrix(data, 3, 2);
    expect(cov[0]).toBeGreaterThan(0); // Cov(X,X) > 0
    expect(cov[3]).toBeGreaterThan(0); // Cov(Y,Y) > 0
    expect(cov[1]).toEqual(cov[2]);     // Symmetric Cov(X,Y) == Cov(Y,X)
  });

  it('generates deterministic stochastic LCG samples', () => {
    const s1 = wasmMatrixEngine.stochasticLcgSimulate(10, 12345);
    const s2 = wasmMatrixEngine.stochasticLcgSimulate(10, 12345);
    expect(Array.from(s1)).toEqual(Array.from(s2)); // 100% Deterministic
  });

  it('scores tensor vectors correctly for 90 lottery numbers', () => {
    const numNumbers = 90;
    const numFeatures = 3;
    const matrix = new Float64Array(numNumbers * numFeatures);
    for (let i = 0; i < numNumbers * numFeatures; i++) {
      matrix[i] = (i % 10) * 0.1;
    }
    const weights = new Float64Array([0.5, 0.3, 0.2]);
    const scores = wasmMatrixEngine.tensorScoreVector(matrix, weights, numNumbers, numFeatures);
    expect(scores.length).toBe(90);
    expect(scores[0]).toBeCloseTo(0.1 * 0.3 + 0.2 * 0.2, 5);
  });

  it('inverts non-singular matrix accurately with invertMatrixFlat', () => {
    // 2x2 matrix: [[4, 7], [2, 6]] -> det = 24 - 14 = 10 -> inv = [[0.6, -0.7], [-0.2, 0.4]]
    const M = new Float64Array([4, 7, 2, 6]);
    const inv = wasmMatrixEngine.invertMatrixFlat(M, 2);
    expect(inv[0]).toBeCloseTo(0.6, 5);
    expect(inv[1]).toBeCloseTo(-0.7, 5);
    expect(inv[2]).toBeCloseTo(-0.2, 5);
    expect(inv[3]).toBeCloseTo(0.4, 5);
  });

  it('computes symmetric eigen decomposition with eigenDecompositionSym', () => {
    // 2x2 symmetric: [[2, 1], [1, 2]] -> eigenvalues: 3 and 1
    const M = new Float64Array([2, 1, 1, 2]);
    const { values, vectors } = wasmMatrixEngine.eigenDecompositionSym(M, 2);
    expect(values.length).toBe(2);
    expect(vectors.length).toBe(4);
    // Les valeurs propres doivent être positives et ordonnées par amplitude
    expect(values[0] + values[1]).toBeCloseTo(4.0, 3); // Trace = 2 + 2 = 4
  });

  it('executes SIMD/WASM vectorized Kernel PCA denoising stably', () => {
    const nSamples = 10;
    const nFeatures = 5;
    const flatData = new Float64Array(nSamples * nFeatures);
    for (let i = 0; i < nSamples * nFeatures; i++) {
      flatData[i] = 10 + (i % 20) * 3.5;
    }

    const denoised = wasmMatrixEngine.denoiseKernelPcaVectorized(flatData, nSamples, nFeatures);
    expect(denoised.length).toBe(nSamples * nFeatures);
    for (let i = 0; i < denoised.length; i++) {
      expect(denoised[i]).toBeGreaterThanOrEqual(0);
      expect(denoised[i]).toBeLessThanOrEqual(100);
      expect(isNaN(denoised[i])).toBe(false);
    }
  });
});
