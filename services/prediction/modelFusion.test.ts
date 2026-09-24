import { describe, it, expect } from 'vitest';
import { calculateFusion } from '../fusionService';
import { getDefaultWeights, normalizeWeights } from './weightsManager';
import { computeModelDnaFingerprint, recordModelDnaVersion, getModelDnaHistory } from './modelDnaKnowledgeBase';
import { runSystematicDnaAudit, computeDeterministicCriticalThreshold } from './dnaAuditService';
import { AlgoKey } from '../../shared/prediction.types';
import type { DrawResult, SpectralMetric } from '../../types';

describe('Model Fusion & ADN Knowledge Base Integration', () => {
  const mockHistory: DrawResult[] = Array.from({ length: 25 }, (_, idx) => ({
    id: `draw-${idx + 1}`,
    date: `2025-01-${String(idx + 1).padStart(2, '0')}`,
    drawName: 'Loto Test',
    gagnants: [
      ((idx * 3 + 1) % 90) + 1,
      ((idx * 7 + 12) % 90) + 1,
      ((idx * 11 + 23) % 90) + 1,
      ((idx * 13 + 45) % 90) + 1,
      ((idx * 17 + 67) % 90) + 1,
    ],
    machine: 'M1',
  }));

  const mockSpectral: SpectralMetric[] = Array.from({ length: 90 }, (_, i) => ({
    number: i + 1,
    frequency: 0.1 * ((i % 5) + 1),
    amplitude: 0.5,
    phase: 0.2,
    spectralPower: 0.8,
  }));

  describe('Tripartite Fusion Calculation & Determinism', () => {
    it('should compute fusion deterministically and return valid ticket structure', () => {
      const weights = getDefaultWeights();
      const result1 = calculateFusion(
        mockHistory,
        [],
        mockSpectral,
        null,
        weights,
        { logic: 1.0, physics: 1.0, intuition: 1.0 },
        'quantum_bayesian'
      );

      const result2 = calculateFusion(
        mockHistory,
        [],
        mockSpectral,
        null,
        weights,
        { logic: 1.0, physics: 1.0, intuition: 1.0 },
        'quantum_bayesian'
      );

      expect(result1.finalTicket).toHaveLength(5);
      expect(result1.finalTicket).toEqual(result2.finalTicket);
      expect(result1.confidence).toBeGreaterThan(0);
      expect(result1.confidence).toBeLessThanOrEqual(100);
      expect(result1.entropy).toBeGreaterThanOrEqual(0);
      expect(result1.convergedNumbers.length).toBeGreaterThanOrEqual(5);
    });

    it('should support all four fusion selection methods without throwing', () => {
      const weights = getDefaultWeights();
      const methods = ['map', 'balanced', 'harmonic_consensus', 'quantum_bayesian'] as const;

      methods.forEach((method) => {
        const res = calculateFusion(
          mockHistory,
          [],
          mockSpectral,
          null,
          weights,
          { logic: 1.2, physics: 0.8, intuition: 1.1 },
          method
        );
        expect(res.finalTicket).toHaveLength(5);
        expect(res.sources.python.length).toBeGreaterThan(0);
        expect(res.sources.quantum.length).toBeGreaterThan(0);
        expect(res.sources.oracle.length).toBeGreaterThan(0);
      });
    });

    it('should calculate Kalman gains by inverse-variance continuously', () => {
      const weights = getDefaultWeights();
      const res = calculateFusion(
        mockHistory,
        [],
        mockSpectral,
        null,
        weights,
        { logic: 1.0, physics: 1.0, intuition: 1.0 },
        'quantum_bayesian'
      );

      expect(res.kalmanGains).toBeDefined();
      expect(res.kalmanGains.logic).toBeGreaterThan(0);
      expect(res.kalmanGains.physics).toBeGreaterThan(0);
      expect(res.kalmanGains.intuition).toBeGreaterThan(0);
    });
  });

  describe('Model DNA Knowledge Base & Draw Isolation', () => {
    it('should produce identical fingerprints for identical weights and drawName', () => {
      const weights = getDefaultWeights();
      const fp1 = computeModelDnaFingerprint('Loto Test', weights);
      const fp2 = computeModelDnaFingerprint('Loto Test', weights);
      const fpOtherDraw = computeModelDnaFingerprint('EuroMillions', weights);

      expect(fp1).toBe(fp2);
      expect(fp1).not.toBe(fpOtherDraw);
    });

    it('should compute deterministic critical threshold without magic numbers', () => {
      const threshold1 = computeDeterministicCriticalThreshold(22, 3.8, 675);
      const threshold2 = computeDeterministicCriticalThreshold(22, 3.8, 675);

      expect(threshold1).toBe(threshold2);
      expect(threshold1).toBeGreaterThan(0.01);
      expect(threshold1).toBeLessThan(0.5);
    });
  });
});
