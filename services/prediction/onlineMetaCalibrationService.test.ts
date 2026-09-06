import { describe, it, expect } from 'vitest';
import {
  computeRobbinsMonroLearningRate,
  applyJamesSteinShrinkage,
  computeMetaMomentumBeta
} from './onlineMetaCalibrationService';
import { DEFAULT_ALGO_WEIGHTS, AlgoKey } from '../../shared/prediction.types';
import { AlgoWeights } from '../../types';

describe('Online Meta-Calibration Service (Axe A)', () => {
  describe('computeRobbinsMonroLearningRate', () => {
    it('should scale inversely with sample depth N (Robbins-Monro O(1/sqrt(N)))', () => {
      const etaSmall = computeRobbinsMonroLearningRate(10, 16, 0.5, 0.5);
      const etaLarge = computeRobbinsMonroLearningRate(200, 16, 0.5, 0.5);

      expect(etaSmall).toBeGreaterThan(etaLarge);
      expect(etaSmall).toBeLessThanOrEqual(0.08);
      expect(etaLarge).toBeGreaterThanOrEqual(0.002);
    });

    it('should continuously dampen learning rate under high Shannon entropy', () => {
      const etaLowEntropy = computeRobbinsMonroLearningRate(50, 16, 0.1, 0.5);
      const etaHighEntropy = computeRobbinsMonroLearningRate(50, 16, 0.9, 0.5);

      expect(etaLowEntropy).toBeGreaterThan(etaHighEntropy);
    });

    it('should amplify learning rate when Hurst exponent indicates persistent momentum (H > 0.5)', () => {
      const etaMeanRevert = computeRobbinsMonroLearningRate(50, 16, 0.5, 0.3);
      const etaPersistent = computeRobbinsMonroLearningRate(50, 16, 0.5, 0.7);

      expect(etaPersistent).toBeGreaterThan(etaMeanRevert);
    });

    it('should be strictly robust against edge cases (0, NaN, extreme values)', () => {
      const etaEdge1 = computeRobbinsMonroLearningRate(0, 0, NaN, NaN);
      expect(isFinite(etaEdge1)).toBe(true);
      expect(etaEdge1).toBeGreaterThanOrEqual(0.002);
      expect(etaEdge1).toBeLessThanOrEqual(0.08);

      const etaEdge2 = computeRobbinsMonroLearningRate(10000, 100, 2.0, -1.0);
      expect(isFinite(etaEdge2)).toBe(true);
      expect(etaEdge2).toBeGreaterThanOrEqual(0.002);
      expect(etaEdge2).toBeLessThanOrEqual(0.08);
    });
  });

  describe('applyJamesSteinShrinkage', () => {
    it('should strongly shrink towards prior when historical sample size N is small', () => {
      const biasedWeights: AlgoWeights = { ...DEFAULT_ALGO_WEIGHTS, [AlgoKey.FREQUENCY]: 0.8, [AlgoKey.GAPS]: 0.2 };
      const resSmallN = applyJamesSteinShrinkage(biasedWeights, DEFAULT_ALGO_WEIGHTS, 10);

      // With N=10, variance of estimation is large -> c_shrink is high
      expect(resSmallN.shrinkageFactor).toBeGreaterThan(0.4);
      // Normalized sum
      const sum = Object.values(resSmallN.shrunkWeights).reduce((a, b) => a + (b || 0), 0);
      expect(sum).toBeCloseTo(1.0, 3);
    });

    it('should give autonomy to active draw empirical weights when sample size N is large', () => {
      const biasedWeights: AlgoWeights = { ...DEFAULT_ALGO_WEIGHTS, [AlgoKey.FREQUENCY]: 0.4, [AlgoKey.GAPS]: 0.2 };
      const resLargeN = applyJamesSteinShrinkage(biasedWeights, DEFAULT_ALGO_WEIGHTS, 500);

      // With N=500, estimation variance is low -> c_shrink is small
      expect(resLargeN.shrinkageFactor).toBeLessThan(0.3);
      expect(resLargeN.distanceToPrior).toBeGreaterThan(0);
    });

    it('should be 100% deterministic across repeated calls', () => {
      const biasedWeights: AlgoWeights = { ...DEFAULT_ALGO_WEIGHTS, [AlgoKey.FREQUENCY]: 0.5 };
      const res1 = applyJamesSteinShrinkage(biasedWeights, DEFAULT_ALGO_WEIGHTS, 50);
      const res2 = applyJamesSteinShrinkage(biasedWeights, DEFAULT_ALGO_WEIGHTS, 50);

      expect(res1.shrinkageFactor).toEqual(res2.shrinkageFactor);
      expect(res1.shrunkWeights).toEqual(res2.shrunkWeights);
    });
  });

  describe('computeMetaMomentumBeta', () => {
    it('should vary continuously between 0.15 and 0.55 depending on Hurst exponent', () => {
      const betaLow = computeMetaMomentumBeta(0.2);
      const betaMid = computeMetaMomentumBeta(0.5);
      const betaHigh = computeMetaMomentumBeta(0.8);

      expect(betaLow).toBeLessThan(betaMid);
      expect(betaMid).toBeLessThan(betaHigh);
      expect(betaLow).toBeGreaterThanOrEqual(0.15);
      expect(betaHigh).toBeLessThanOrEqual(0.55);
    });
  });
});
