import { describe, it, expect, beforeAll } from 'vitest';
import {
  initLotoEngineWasm,
  isLotoEngineWasmReady,
  computeSpatialGridHpc,
  computeBarycenterTrajectoryHpc,
  computePearsonCorrelationHpc,
  computePearsonCorrelationMatrixHpc,
} from '../src/services/wasm/lotoEngineBridge';
import { calculateSpatialMetrics, getBarycenterTrajectory } from '../src/services/spatialService';
import type { DrawResult } from '../src/types';

describe('Chantier A: Spatial & Gap Pattern HPC Integration', () => {
  beforeAll(async () => {
    // Attempt WASM initialization if not already initialized
    await initLotoEngineWasm();
  });

  describe('Pearson Correlation HPC', () => {
    it('computes correct correlation for identical vectors (r = 1.0)', () => {
      const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const y = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
      const r = computePearsonCorrelationHpc(x, y);
      expect(r).not.toBeNull();
      expect(r!).toBeCloseTo(1.0, 5);
    });

    it('computes correct correlation for inversely proportional vectors (r = -1.0)', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [10, 8, 6, 4, 2];
      const r = computePearsonCorrelationHpc(x, y);
      expect(r).not.toBeNull();
      expect(r!).toBeCloseTo(-1.0, 5);
    });

    it('returns null safely without throwing or NaN for constant zero-variance vectors', () => {
      const constX = [5, 5, 5, 5, 5];
      const y = [1, 2, 3, 4, 5];
      const r = computePearsonCorrelationHpc(constX, y);
      expect(r).toBeNull();
    });

    it('computes a complete symmetric correlation matrix with 1.0 diagonal', () => {
      const algoScores = {
        markov: [0.1, 0.4, 0.7, 0.2],
        spectral: [0.2, 0.5, 0.8, 0.3],
        hurst: [0.9, 0.1, 0.3, 0.6],
      };
      const keys = ['markov', 'spectral', 'hurst'] as const;
      const { matrix, average } = computePearsonCorrelationMatrixHpc(algoScores, keys);

      expect(Object.keys(matrix)).toHaveLength(3);
      expect(average).toBeGreaterThanOrEqual(0);

      for (const k1 of keys) {
        expect(matrix[k1][k1]).toBeCloseTo(1.0, 4);
        for (const k2 of keys) {
          const val1 = matrix[k1][k2];
          const val2 = matrix[k2][k1];
          if (val1 !== null && val2 !== null) {
            expect(val1).toBeCloseTo(val2, 4);
            expect(val1).toBeGreaterThanOrEqual(-1.0);
            expect(val1).toBeLessThanOrEqual(1.0);
          }
        }
      }
    });
  });

  describe('Spatial Grid Density & Newtonian Fields HPC', () => {
    it('executes computeSpatialGridHpc and returns 90 calibrated points with valid entropy and barycenter', () => {
      // 3 simulated draws of 5 numbers each in 1..90
      const flatDraws = new Int32Array([
        1, 12, 23, 45, 89,
        5, 14, 25, 60, 77,
        10, 20, 30, 40, 50,
      ]);
      const metrics = computeSpatialGridHpc(flatDraws, 3);

      expect(metrics.gridDensity).toHaveLength(90);
      expect(metrics.gravityPulls).toHaveLength(90);
      expect(metrics.entropy).toBeGreaterThan(0);
      expect(metrics.entropy).toBeLessThanOrEqual(1.0);
      expect(metrics.barycenterX).toBeGreaterThanOrEqual(0);
      expect(metrics.barycenterX).toBeLessThanOrEqual(10);
      expect(metrics.barycenterY).toBeGreaterThanOrEqual(0);
      expect(metrics.barycenterY).toBeLessThanOrEqual(9);
      expect(metrics.densityThreshold).toBeGreaterThan(0);

      // Verify non-zero density at drawn positions
      // drawn numbers: 1 (idx 0), 12 (idx 11), 23 (idx 22), 45 (idx 44), 89 (idx 88)
      expect(metrics.gridDensity[0]).toBeGreaterThan(0);
      expect(metrics.gridDensity[11]).toBeGreaterThan(0);
      expect(metrics.gravityPulls[0]).toBeGreaterThan(0);
    });

    it('computes barycenter trajectories over historical draw slices correctly', () => {
      const mockResults: DrawResult[] = [
        {
          id: 'draw-1',
          date: '2025-01-01',
          drawName: 'Midi',
          gagnants: [1, 2, 3, 4, 5],
          machine: [6, 7, 8, 9, 10],
        },
        {
          id: 'draw-2',
          date: '2025-01-02',
          drawName: 'Midi',
          gagnants: [80, 81, 82, 83, 84],
          machine: [85, 86, 87, 88, 89],
        },
        {
          id: 'draw-3',
          date: '2025-01-03',
          drawName: 'Midi',
          gagnants: [41, 42, 43, 44, 45],
          machine: [46, 47, 48, 49, 50],
        },
      ];

      const trajectory = computeBarycenterTrajectoryHpc(mockResults, 3);
      expect(trajectory).toHaveLength(3);
      expect(trajectory[0].drawIndex).toBe(0);
      expect(trajectory[1].drawIndex).toBe(1);
      expect(trajectory[2].drawIndex).toBe(2);

      // Slices should reflect actual coordinate shifts
      for (const pt of trajectory) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('High-Level SpatialService Integration', () => {
    it('seamlessly integrates calculateSpatialMetrics with LotoResult dataset', () => {
      const mockResults: DrawResult[] = [
        {
          id: 'draw-1',
          date: '2025-01-01',
          drawName: 'Midi',
          gagnants: [7, 14, 21, 28, 35],
          machine: [42, 49, 56, 63, 70],
        },
        {
          id: 'draw-2',
          date: '2025-01-02',
          drawName: 'Midi',
          gagnants: [3, 11, 27, 44, 88],
          machine: [],
        },
      ];

      const result = calculateSpatialMetrics(mockResults);
      expect(result.gridDensity).toHaveLength(91);
      expect(result.barycenter.x).toBeGreaterThanOrEqual(0);
      expect(result.barycenter.y).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.gravityWells)).toBe(true);
      expect(Array.isArray(result.advancedClusters)).toBe(true);
    });

    it('computes trajectory with getBarycenterTrajectory', () => {
      const mockResults: DrawResult[] = [
        {
          id: 'draw-1',
          date: '2025-01-01',
          drawName: 'Midi',
          gagnants: [10, 20, 30, 40, 50],
          machine: [],
        },
      ];
      const trajectory = getBarycenterTrajectory(mockResults, 5);
      expect(trajectory).toHaveLength(1);
      expect(trajectory[0].x).toBeGreaterThan(0);
      expect(trajectory[0].y).toBeGreaterThan(0);
    });
  });
});

