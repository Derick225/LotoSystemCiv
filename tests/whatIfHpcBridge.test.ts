import { describe, it, expect } from 'vitest';
import {
  runMonteCarloWhatIfHpc,
  computeKlDivergenceHpc,
  runFinancialSimulationHpc,
  computeClosedLoopAutopsyHpc,
  dotProductHpc,
  tensorScoreHpc,
} from '../src/services/wasm/lotoEngineBridge';
import { runMonteCarloStressTest, computeKLDivergence } from '../src/services/simulation/whatIfEngine';

describe('Axe 1 : Performance & Noyau Rust / WASM HPC Bridge', () => {
  it('exécute runMonteCarloWhatIfHpc avec reproductibilité déterministe et cohérence p5/p95', () => {
    const kAlgos = 3;
    const baseMatrix = new Float64Array(90 * kAlgos);
    // Remplir une matrice simple
    for (let b = 0; b < 90; b++) {
      baseMatrix[b * kAlgos + 0] = (b + 1) * 0.1;
      baseMatrix[b * kAlgos + 1] = ((90 - b) * 0.05);
      baseMatrix[b * kAlgos + 2] = 1.0;
    }
    const baseWeights = new Float64Array([0.5, 0.3, 0.2]);

    const res1 = runMonteCarloWhatIfHpc({
      baseMatrix,
      kAlgos,
      baseWeights,
      iterations: 50,
      noiseStdDev: 0.02,
      seed: 424242n,
    });

    const res2 = runMonteCarloWhatIfHpc({
      baseMatrix,
      kAlgos,
      baseWeights,
      iterations: 50,
      noiseStdDev: 0.02,
      seed: 424242n,
    });

    expect(res1.length).toBe(90);
    expect(res1[0].ball).toBe(res2[0].ball);
    expect(res1[0].meanScore).toBe(res2[0].meanScore);
    expect(res1[0].p5).toBeLessThanOrEqual(res1[0].p95);
    expect(res1[0].stabilityIndex).toBeGreaterThanOrEqual(0);
    expect(res1[0].stabilityIndex).toBeLessThanOrEqual(100);
  });

  it('calcule computeKlDivergenceHpc avec D_KL(P||P) = 0 et D_KL(P||Q) >= 0', () => {
    const p = new Float64Array(90).fill(1.0 / 90.0);
    const klIdentical = computeKlDivergenceHpc(p, p);
    expect(klIdentical).toBe(0);

    const q = new Float64Array(90);
    for (let i = 0; i < 90; i++) {
      q[i] = (i + 1) / ((90 * 91) / 2);
    }
    const klDiff = computeKlDivergenceHpc(p, q);
    expect(klDiff).toBeGreaterThan(0);

    // Vérifier l'intégration dans whatIfEngine
    const klViaEngine = computeKLDivergence(Array.from(p), Array.from(q));
    expect(klViaEngine).toBe(klDiff);
  });

  it('exécute runMonteCarloStressTest via whatIfEngine avec la passerelle HPC', () => {
    const weights: any = {
      frequency: 0.4,
      gaps: 0.3,
      momentum: 0.3,
    };
    const evalGrid = (w: any) => {
      const out = new Array(90);
      for (let i = 0; i < 90; i++) {
        out[i] = (i + 1) * (w.frequency || 0) + (90 - i) * (w.gaps || 0);
      }
      return out;
    };

    const mcResults = runMonteCarloStressTest(weights, evalGrid, 40, 0.05);
    expect(mcResults.length).toBe(10); // Top 10 retourné
    expect(mcResults[0].meanScore).toBeGreaterThanOrEqual(mcResults[1].meanScore);
    expect(mcResults[0].p5).toBeLessThanOrEqual(mcResults[0].p95);
  });

  it('exécute la simulation financière HPC déterministe', () => {
    const hitsHistory = new Int32Array([0, 1, 2, 0, 3, 1, 0, 2]);
    const confidences = new Float64Array([50, 60, 70, 45, 80, 55, 40, 65]);
    const multipliers = new Float64Array([0, 0, 2.5, 0, 10.0, 0, 0, 2.5]);

    const sim = runFinancialSimulationHpc({
      hitsHistory,
      confidences,
      multipliers,
      strategyCode: 0, // Flat
      initialBankroll: 10000,
      unitBet: 200,
    });

    expect(sim.balances.length).toBe(8);
    expect(typeof sim.netProfit).toBe('number');
    expect(typeof sim.sharpeRatio).toBe('number');
    expect(sim.winRate).toBeGreaterThan(0);
    expect(sim.maxDrawdown).toBeGreaterThanOrEqual(0);
  });

  it('calcule l\'autopsie en boucle fermée HPC et conserve le simplexe des poids', () => {
    const preds = new Int32Array([5, 12, 23, 45, 67]);
    const winners = new Int32Array([12, 23, 30, 45, 89]);
    const currentWeights = new Float64Array([0.25, 0.25, 0.25, 0.25]);
    const contribs = new Float64Array(4 * 91);
    for (let i = 0; i < 4 * 91; i++) {
      contribs[i] = 0.5;
    }

    const autopsy = computeClosedLoopAutopsyHpc({
      predictedNumbers: preds,
      actualWinners: winners,
      currentWeights,
      algoContributionsFlat: contribs,
      numAlgos: 4,
      historyDepth: 50,
    });

    expect(autopsy.exactHits).toBe(3); // 12, 23, 45
    expect(autopsy.updatedWeights.length).toBe(4);
    // Somme des poids ≈ 1.0 (simplexe de probabilité)
    let sumW = 0;
    for (let i = 0; i < 4; i++) sumW += autopsy.updatedWeights[i];
    expect(sumW).toBeCloseTo(1.0, 3);
    expect(autopsy.brierScore).toBeGreaterThanOrEqual(0);
  });

  it('exécute le produit scalaire et le scoring tensoriel vectorisé', () => {
    const a = new Float64Array([1, 2, 3, 4, 5]);
    const b = new Float64Array([2, 3, 4, 5, 6]);
    const dot = dotProductHpc(a, b);
    expect(dot).toBe(1 * 2 + 2 * 3 + 3 * 4 + 4 * 5 + 5 * 6); // 2 + 6 + 12 + 20 + 30 = 70

    const feat = new Float64Array(90 * 2);
    for (let i = 0; i < 90; i++) {
      feat[i * 2 + 0] = i;
      feat[i * 2 + 1] = 1;
    }
    const weights = new Float64Array([2.0, 10.0]);
    const scores = tensorScoreHpc(feat, weights, 90, 2);
    expect(scores.length).toBe(90);
    expect(scores[0]).toBe(0 * 2 + 10); // 10
    expect(scores[5]).toBe(5 * 2 + 10); // 20
  });
});
