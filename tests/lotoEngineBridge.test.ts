import { describe, it, expect } from 'vitest';
import {
  computeRobustHurstHpc,
  computeFftPowerSpectrumHpc,
  computeCrossHawkesKernelHpc,
  computeMarkovTransitionHpc,
  solveCombinatorialAnnealingHpc,
  computeTopologicalLyapunovHpc,
} from '../services/wasm/lotoEngineBridge';

describe('LotoEngine HPC Bridge & Fallbacks', () => {
  it('calcule un exposant de Hurst déterministe et cohérent', () => {
    // Signal persistant régulier
    const persistentSignal = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const h1 = computeRobustHurstHpc(persistentSignal);
    const h2 = computeRobustHurstHpc(persistentSignal);

    expect(h1).toBeGreaterThanOrEqual(0.01);
    expect(h1).toBeLessThanOrEqual(0.99);
    expect(h1).toBe(h2); // Reproductibilité stricte
  });

  it('calcule la densité spectrale de puissance FFT', () => {
    const signal = new Float64Array([1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
    const psd = computeFftPowerSpectrumHpc(signal);

    expect(psd.length).toBeGreaterThan(0);
    expect(psd[0]).toBeGreaterThanOrEqual(0);
  });

  it('calcule le noyau de Hawkes croisé multi-lags avec conservation continue', () => {
    const predDraws = new Int32Array([
      10, 20, 30, 40, 50,
      12, 22, 32, 42, 52,
    ]);
    const baseline = new Float64Array(91).fill(1 / 90);
    const coupling = new Float64Array(91 * 91);
    // Couplage prédécesseur 10 -> cible 15
    coupling[10 * 91 + 15] = 0.5;

    const res = computeCrossHawkesKernelHpc({
      predOccurrences: predDraws,
      lagCount: 2,
      winCols: 5,
      targetBaseline: baseline,
      couplingMatrix: coupling,
      betaDecay: 0.15,
    });

    expect(res.intensities.length).toBe(91);
    expect(res.intensities[15]).toBeGreaterThan(res.intensities[1]);
    expect(res.total_energy).toBeGreaterThan(0);
  });

  it('génère la matrice de transition markovienne normalisée', () => {
    const history = new Int32Array([
      1, 2, 3, 4, 5,
      1, 6, 7, 8, 9,
      2, 10, 11, 12, 13,
    ]);
    const mat = computeMarkovTransitionHpc(history, 3, 5, 90);
    expect(mat.length).toBe(90 * 90);
  });

  it('exécute le recuit simulé combinatoire déterministe', () => {
    const candidatePool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const scores = new Float64Array(91);
    scores[7] = 100;
    scores[8] = 95;
    scores[9] = 90;
    const affinities = new Float64Array(91 * 91);

    const res = solveCombinatorialAnnealingHpc({
      candidatePool,
      scores91: scores,
      affinityMatrix: affinities,
      deterministicSeed: 42,
    });

    expect(res.best_combination.length).toBe(5);
    expect(res.iterations_run).toBeGreaterThan(0);
  });

  it('calcule la dynamique topologique de Lyapunov continue', () => {
    const draws = new Int32Array([
      5, 15, 25, 35, 45,
      6, 16, 26, 36, 46,
      7, 17, 27, 37, 47,
    ]);
    const res = computeTopologicalLyapunovHpc(draws, 3, 5, 10);
    expect(typeof res.lyapunov_exponent).toBe('number');
    expect(typeof res.is_chaotic).toBe('boolean');
    expect(res.divergence_force).toBeGreaterThanOrEqual(0);
  });
});
