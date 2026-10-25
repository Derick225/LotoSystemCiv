import { describe, it, expect, beforeAll } from 'vitest';
import { AlgoKey, DEFAULT_ALGO_WEIGHTS, RETIRED_ALGO_WEIGHT_KEYS } from '../src/shared/prediction.types';
import { initCoreAlgorithms } from '../src/services/prediction/algorithms';
import { gapPatternPlugin } from '../src/services/prediction/algorithms/gapPattern';
import { gapSequencePlugin } from '../src/services/prediction/algorithms/gapSequence';
import { sequencePatternPlugin } from '../src/services/prediction/algorithms/sequencePattern';
import { interMonthlyResonancePlugin } from '../src/services/prediction/algorithms/interMonthlyResonance';
import { getActiveAlgorithms, AlgorithmContext } from '../src/services/prediction/algorithmRegistry';
import { generateDeterministicFallbackHistory } from '../src/services/lotteryService';
import type { DrawResult } from '../src/types';

describe('CONTRAT DES 4 ALGORITHMES REQUALIFIÉS (AGENTS.md)', () => {
  beforeAll(() => {
    initCoreAlgorithms();
  });

  const history: DrawResult[] = generateDeterministicFallbackHistory('Fortune').slice(0, 45);

  const mockContext: AlgorithmContext = {
    features: {} as any,
    advancedMetrics: {} as any,
    history,
    drawName: 'Fortune',
    statisticalBounds: {
      median: 17.5,
      q1: 8.0,
      q3: 31.0,
      variance: 220.0,
      kurtosis: 3.2,
      skewness: 1.1,
      shannonEntropy: 0.94,
      hurstExponent: 0.52,
    },
    deterministicSeed: 42,
  };

  it('les 4 algorithmes sont sortis des listes de retrait et sont pleinement actifs', () => {
    expect(RETIRED_ALGO_WEIGHT_KEYS.has(AlgoKey.GAP_PATTERN)).toBe(false);
    expect(RETIRED_ALGO_WEIGHT_KEYS.has(AlgoKey.GAP_SEQUENCE)).toBe(false);
    expect(RETIRED_ALGO_WEIGHT_KEYS.has(AlgoKey.SEQUENCE_PATTERN)).toBe(false);
    expect(RETIRED_ALGO_WEIGHT_KEYS.has(AlgoKey.INTER_MONTHLY_RESONANCE)).toBe(false);

    expect(DEFAULT_ALGO_WEIGHTS[AlgoKey.GAP_PATTERN]).toBeGreaterThan(0);
    expect(DEFAULT_ALGO_WEIGHTS[AlgoKey.GAP_SEQUENCE]).toBeGreaterThan(0);
    expect(DEFAULT_ALGO_WEIGHTS[AlgoKey.SEQUENCE_PATTERN]).toBeGreaterThan(0);
    expect(DEFAULT_ALGO_WEIGHTS[AlgoKey.INTER_MONTHLY_RESONANCE]).toBeGreaterThan(0);

    const activePlugins = getActiveAlgorithms().map(p => p.key);
    expect(activePlugins).toContain(AlgoKey.GAP_PATTERN);
    expect(activePlugins).toContain(AlgoKey.GAP_SEQUENCE);
    expect(activePlugins).toContain(AlgoKey.SEQUENCE_PATTERN);
    expect(activePlugins).toContain(AlgoKey.INTER_MONTHLY_RESONANCE);
  });

  describe('1. Processus de Hawkes Discret Mutuel (GAP_PATTERN)', () => {
    it('calcule des scores et intensités finis bornés sur [0, 100]', () => {
      const ctx = { ...mockContext, pluginCache: {} };
      gapPatternPlugin.precompute!(ctx);

      for (let num = 1; num <= 90; num++) {
        const res = gapPatternPlugin.evaluate(num, ctx);
        expect(res.score).toBeGreaterThanOrEqual(0);
        expect(res.score).toBeLessThanOrEqual(100);
        expect(Number.isFinite(res.score)).toBe(true);
        expect(res.confidence).toBeGreaterThan(0);
        expect(res.confidence).toBeLessThanOrEqual(1);
        expect(res.metadata?.model).toContain('Hawkes');
      }
    });

    it('garantit un déterminisme absolu à historique identique', () => {
      const ctx1 = { ...mockContext, pluginCache: {} };
      const ctx2 = { ...mockContext, pluginCache: {} };
      gapPatternPlugin.precompute!(ctx1);
      gapPatternPlugin.precompute!(ctx2);

      for (let num = 1; num <= 90; num++) {
        const r1 = gapPatternPlugin.evaluate(num, ctx1);
        const r2 = gapPatternPlugin.evaluate(num, ctx2);
        expect(r1.score).toBe(r2.score);
        expect(r1.confidence).toBe(r2.confidence);
      }
    });
  });

  describe('2. Champ Moyen d Ising (GAP_SEQUENCE)', () => {
    it('calcule une aimantation valide dans [-1, 1] et un score dans [0, 100]', () => {
      const ctx = { ...mockContext, pluginCache: {} };
      gapSequencePlugin.precompute!(ctx);

      for (let num = 1; num <= 90; num++) {
        const res = gapSequencePlugin.evaluate(num, ctx);
        expect(res.score).toBeGreaterThanOrEqual(0);
        expect(res.score).toBeLessThanOrEqual(100);
        expect(Number.isFinite(res.score)).toBe(true);
        expect(res.confidence).toBeGreaterThan(0);
        expect(res.confidence).toBeLessThanOrEqual(1);
        expect(res.metadata?.isingMagnetization).toBeGreaterThanOrEqual(-1.0);
        expect(res.metadata?.isingMagnetization).toBeLessThanOrEqual(1.0);
        expect(res.metadata?.model).toContain('Ising');
      }
    });

    it('est strictement déterministe', () => {
      const ctx1 = { ...mockContext, pluginCache: {} };
      const ctx2 = { ...mockContext, pluginCache: {} };
      gapSequencePlugin.precompute!(ctx1);
      gapSequencePlugin.precompute!(ctx2);

      for (let num = 1; num <= 90; num++) {
        const r1 = gapSequencePlugin.evaluate(num, ctx1);
        const r2 = gapSequencePlugin.evaluate(num, ctx2);
        expect(r1.score).toBe(r2.score);
      }
    });
  });

  describe('3. Entropie de Permutation Locale (SEQUENCE_PATTERN)', () => {
    it('calcule une divergence de Kullback-Leibler D_KL >= 0 et des scores bornés', () => {
      const ctx = { ...mockContext, pluginCache: {} };
      sequencePatternPlugin.precompute!(ctx);

      for (let num = 1; num <= 90; num++) {
        const res = sequencePatternPlugin.evaluate(num, ctx);
        expect(res.score).toBeGreaterThanOrEqual(0);
        expect(res.score).toBeLessThanOrEqual(100);
        expect(Number.isFinite(res.score)).toBe(true);
        expect(res.metadata?.permutationEntropyKL).toBeGreaterThanOrEqual(0);
        expect(res.metadata?.model).toContain('Bandt-Pompe');
      }
    });

    it('garantit une reproductibilité exacte sans aucun appel aléatoire', () => {
      const ctx1 = { ...mockContext, pluginCache: {} };
      const ctx2 = { ...mockContext, pluginCache: {} };
      sequencePatternPlugin.precompute!(ctx1);
      sequencePatternPlugin.precompute!(ctx2);

      for (let num = 1; num <= 90; num++) {
        const r1 = sequencePatternPlugin.evaluate(num, ctx1);
        const r2 = sequencePatternPlugin.evaluate(num, ctx2);
        expect(r1.score).toBe(r2.score);
      }
    });
  });

  describe('4. Ondelettes Multi-Échelles Cycle 18 (INTER_MONTHLY_RESONANCE)', () => {
    it('calcule la transformée en ondelettes sur le cycle fondamental de 18 tirages', () => {
      const ctx = { ...mockContext, pluginCache: {} };
      interMonthlyResonancePlugin.precompute!(ctx);

      for (let num = 1; num <= 90; num++) {
        const res = interMonthlyResonancePlugin.evaluate(num, ctx);
        expect(res.score).toBeGreaterThanOrEqual(0);
        expect(res.score).toBeLessThanOrEqual(100);
        expect(Number.isFinite(res.score)).toBe(true);
        expect(res.metadata?.fundamentalCycle).toBe(18);
        expect(res.metadata?.model).toContain('Ricker Wavelet');
      }
    });

    it('est 100% déterministe et reproductible', () => {
      const ctx1 = { ...mockContext, pluginCache: {} };
      const ctx2 = { ...mockContext, pluginCache: {} };
      interMonthlyResonancePlugin.precompute!(ctx1);
      interMonthlyResonancePlugin.precompute!(ctx2);

      for (let num = 1; num <= 90; num++) {
        const r1 = interMonthlyResonancePlugin.evaluate(num, ctx1);
        const r2 = interMonthlyResonancePlugin.evaluate(num, ctx2);
        expect(r1.score).toBe(r2.score);
      }
    });
  });

  describe('5. Orthogonalité mutuelle des 4 canaux (absence de doublon)', () => {
    it('prouve que les 4 signaux sont distincts et non colinéaires (|Pearson r| < 0.95)', () => {
      const ctx = { ...mockContext, pluginCache: {} };
      gapPatternPlugin.precompute!(ctx);
      gapSequencePlugin.precompute!(ctx);
      sequencePatternPlugin.precompute!(ctx);
      interMonthlyResonancePlugin.precompute!(ctx);

      const vHawkes: number[] = [];
      const vIsing: number[] = [];
      const vEntropy: number[] = [];
      const vWavelet: number[] = [];

      for (let n = 1; n <= 90; n++) {
        vHawkes.push(gapPatternPlugin.evaluate(n, ctx).score);
        vIsing.push(gapSequencePlugin.evaluate(n, ctx).score);
        vEntropy.push(sequencePatternPlugin.evaluate(n, ctx).score);
        vWavelet.push(interMonthlyResonancePlugin.evaluate(n, ctx).score);
      }

      const pearson = (a: number[], b: number[]): number => {
        const n = a.length;
        const meanA = a.reduce((s, x) => s + x, 0) / n;
        const meanB = b.reduce((s, x) => s + x, 0) / n;
        let num = 0, denA = 0, denB = 0;
        for (let i = 0; i < n; i++) {
          const da = a[i] - meanA;
          const db = b[i] - meanB;
          num += da * db;
          denA += da * da;
          denB += db * db;
        }
        return num / Math.sqrt((denA * denB) || 1.0);
      };

      const rHawkesIsing = pearson(vHawkes, vIsing);
      const rHawkesEntropy = pearson(vHawkes, vEntropy);
      const rHawkesWavelet = pearson(vHawkes, vWavelet);
      const rIsingEntropy = pearson(vIsing, vEntropy);
      const rIsingWavelet = pearson(vIsing, vWavelet);
      const rEntropyWavelet = pearson(vEntropy, vWavelet);

      // Aucun des couples de canaux ne doit être un clone colinéaire (|r| < 0.95)
      expect(Math.abs(rHawkesIsing)).toBeLessThan(0.95);
      expect(Math.abs(rHawkesEntropy)).toBeLessThan(0.95);
      expect(Math.abs(rHawkesWavelet)).toBeLessThan(0.95);
      expect(Math.abs(rIsingEntropy)).toBeLessThan(0.95);
      expect(Math.abs(rIsingWavelet)).toBeLessThan(0.95);
      expect(Math.abs(rEntropyWavelet)).toBeLessThan(0.95);
    });
  });
});
