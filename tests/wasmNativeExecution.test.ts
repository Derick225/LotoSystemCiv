import { describe, it, expect, beforeAll } from 'vitest';
import {
  initializeLotoEngineWasm,
  isLotoEngineWasmReady,
  getHpcEngineMode,
  computeRobustHurstHpc,
  computeFftPowerSpectrumHpc,
  computeCrossHawkesKernelHpc,
  solveCombinatorialAnnealingHpc,
  computeMarkovTransitionHpc,
  computeTopologicalLyapunovHpc
} from '../services/wasm/lotoEngineBridge';

describe('Rust WASM Native Execution Suite', () => {
  beforeAll(async () => {
    const initialized = await initializeLotoEngineWasm();
    expect(initialized).toBe(true);
  });

  it('should successfully initialize the native Rust WebAssembly module', () => {
    expect(isLotoEngineWasmReady()).toBe(true);
    expect(getHpcEngineMode()).toBe('RUST_WASM');
  });

  it('should compute Hurst exponent at native Rust speed with mathematical bounds [0, 1]', () => {
    const signal = new Float64Array([10, 12, 15, 14, 18, 22, 25, 29, 31, 35, 40, 42, 45, 50, 55]);
    const hurst = computeRobustHurstHpc(signal);
    expect(typeof hurst).toBe('number');
    expect(hurst).toBeGreaterThanOrEqual(0);
    expect(hurst).toBeLessThanOrEqual(1);
  });

  it('should compute FFT power spectrum with rustfft via native WASM', () => {
    const signal = new Float64Array(32);
    for (let i = 0; i < 32; i++) {
      signal[i] = Math.sin((2 * Math.PI * i) / 8);
    }
    const psd = computeFftPowerSpectrumHpc(signal);
    expect(psd.length).toBeGreaterThan(0);
    expect(psd[0]).toBeGreaterThanOrEqual(0);
  });

  it('should compute Cross-Hawkes self-exciting process kernel via Rust WASM', () => {
    const predOccurrences = new Int32Array([1, 2, 4, 7, 11, 16, 22]);
    const targetBaseline = new Float64Array(91).fill(0.05);
    const couplingMatrix = new Float64Array(91 * 91).fill(0.01);
    
    const hawkes = computeCrossHawkesKernelHpc({
      predOccurrences,
      lagCount: 7,
      winCols: 1,
      targetBaseline,
      couplingMatrix,
      betaDecay: 0.1,
    });
    expect(hawkes.intensities.length).toBe(91);
    expect(hawkes.total_energy).toBeGreaterThan(0);
  });

  it('should perform Combinatorial Simulated Annealing with deterministic LCG seed 5 (Seed 5 HPC)', () => {
    const candidatePool = new Int32Array([7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84]);
    const scores91 = new Float64Array(91);
    candidatePool.forEach((n) => { scores91[n] = 0.85; });
    const affinityMatrix = new Float64Array(91 * 91);

    const result = solveCombinatorialAnnealingHpc({
      candidatePool,
      scores91,
      affinityMatrix,
      initialTemperature: 10.0,
      coolingRate: 0.95,
      minTemperature: 0.01,
      iterationsPerTemp: 40,
      deterministicSeed: 5,
    });

    expect(result.best_combination).toHaveLength(5);
    expect(result.iterations_run).toBeGreaterThan(0);
    const unique = new Set(result.best_combination);
    expect(unique.size).toBe(5);
    result.best_combination.forEach((num) => {
      expect(num).toBeGreaterThanOrEqual(1);
      expect(num).toBeLessThanOrEqual(90);
    });
  });

  it('should compute Markov transitions and Lyapunov chaos exponents via native Rust WASM', () => {
    const numDraws = 15;
    const flatDraws = new Int32Array(numDraws * 5);
    for (let d = 0; d < numDraws; d++) {
      for (let c = 0; c < 5; c++) {
        flatDraws[d * 5 + c] = ((d * 5 + c * 7) % 90) + 1;
      }
    }

    const markov = computeMarkovTransitionHpc(flatDraws, numDraws, 5, 90);
    expect(markov.length).toBe(90 * 90);

    const lyap = computeTopologicalLyapunovHpc(flatDraws, numDraws, 5, 10);
    expect(typeof lyap.lyapunov_exponent).toBe('number');
    expect(typeof lyap.is_chaotic).toBe('boolean');
    expect(typeof lyap.divergence_force).toBe('number');
    expect(typeof lyap.topological_entropy).toBe('number');
  });
});
