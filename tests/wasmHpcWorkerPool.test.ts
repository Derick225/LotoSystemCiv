import { describe, it, expect, beforeAll } from 'vitest';
import { wasmHpcWorkerPool } from '../src/services/wasm/wasmHpcWorkerPool';
import { calculateSpatialMetricsAsync, getBarycenterTrajectoryAsync } from '../src/services/spatialService';
import type { DrawResult } from '../src/types';
import { initLotoEngineWasm } from '../src/services/wasm/lotoEngineBridge';

describe('Chantier B: Web Worker WASM Dédié & Pool HPC 60 FPS', () => {
  beforeAll(async () => {
    await initLotoEngineWasm();
  });

  describe('Métriques du Pool & Robustesse Déterministe', () => {
    it('initializes the pool and provides operational metrics', () => {
      const metrics = wasmHpcWorkerPool.getMetrics();
      expect(metrics).toBeDefined();
      expect(typeof metrics.workerActive).toBe('boolean');
      expect(typeof metrics.totalTasksExecuted).toBe('number');
      expect(typeof metrics.fallbackCount).toBe('number');
      expect(typeof metrics.pendingTasks).toBe('number');
    });

    it('executes a PING task without throwing', async () => {
      const res = await wasmHpcWorkerPool.executeTask<{ status: string; timestamp: number }>('PING');
      expect(res).toBeDefined();
      expect(res.status).toMatch(/^PONG/);
      expect(res.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Calculs Spatiaux Asynchrones Hors Thread Principal', () => {
    it('computes spatial grid densities, gravity wells and entropy asynchronously', async () => {
      const flat = new Int32Array([
        5, 15, 25, 35, 45,
        10, 20, 30, 40, 50,
        1, 2, 3, 4, 5,
      ]);
      const result = await wasmHpcWorkerPool.computeSpatialGridAsync(flat, 3);

      expect(result).toBeDefined();
      expect(result.gridDensity).toHaveLength(90);
      expect(result.gravityPulls).toHaveLength(90);
      expect(result.entropy).toBeGreaterThan(0);
      expect(result.entropy).toBeLessThanOrEqual(1.0);
      expect(result.barycenterX).toBeGreaterThanOrEqual(0);
      expect(result.barycenterX).toBeLessThanOrEqual(10);
      expect(result.barycenterY).toBeGreaterThanOrEqual(0);
      expect(result.barycenterY).toBeLessThanOrEqual(9);
      expect(result.densityThreshold).toBeGreaterThan(0);

      // Verify non-zero density at drawn indices
      expect(result.gridDensity[4]).toBeGreaterThan(0); // number 5 (idx 4)
      expect(result.gridDensity[14]).toBeGreaterThan(0); // number 15 (idx 14)
    });

    it('computes barycenter trajectories over slices asynchronously', async () => {
      const mockDraws = [
        { gagnants: [10, 20, 30, 40, 50], date: '2026-01-01' },
        { gagnants: [60, 70, 80, 85, 90], date: '2026-01-02' },
      ];
      const traj = await wasmHpcWorkerPool.computeBarycenterTrajectoryAsync(mockDraws, 2);

      expect(traj).toHaveLength(2);
      expect(traj[0].drawIndex).toBe(0);
      expect(traj[1].drawIndex).toBe(1);
      expect(traj[0].x).toBeGreaterThanOrEqual(0);
      expect(traj[0].y).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Corrélations de Pearson Asynchrones (Zéro Allocation)', () => {
    it('computes Pearson correlation asynchronously with exact precision', async () => {
      const x = [1, 2, 3, 4, 5, 6, 7, 8];
      const y = [2, 4, 6, 8, 10, 12, 14, 16];
      const r = await wasmHpcWorkerPool.computePearsonCorrelationAsync(x, y);

      expect(r).not.toBeNull();
      expect(r!).toBeCloseTo(1.0, 4);
    });

    it('handles zero-variance vectors safely without NaN', async () => {
      const x = [4, 4, 4, 4];
      const y = [1, 2, 3, 4];
      const r = await wasmHpcWorkerPool.computePearsonCorrelationAsync(x, y);

      expect(r).toBeNull();
    });

    it('computes full correlation matrix asynchronously', async () => {
      const scores = {
        markov: [0.2, 0.4, 0.6, 0.8],
        hurst: [0.8, 0.6, 0.4, 0.2],
      };
      const keys = ['markov', 'hurst'] as const;
      const { matrix, average } = await wasmHpcWorkerPool.computePearsonMatrixAsync(scores, keys);

      expect(matrix.markov.markov).toBeCloseTo(1.0, 4);
      expect(matrix.hurst.hurst).toBeCloseTo(1.0, 4);
      expect(matrix.markov.hurst).toBeCloseTo(-1.0, 4);
      expect(average).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Intégration de Haut Niveau dans spatialService (60 FPS)', () => {
    it('calculates full spatial metrics asynchronously with clusters and gravity wells', async () => {
      const mockHistory: DrawResult[] = [
        {
          id: 'd-1',
          date: '2026-01-01',
          drawName: 'Akwaba',
          gagnants: [12, 24, 36, 48, 60],
          machine: [2, 4, 6, 8, 10],
        },
        {
          id: 'd-2',
          date: '2026-01-02',
          drawName: 'Akwaba',
          gagnants: [1, 11, 21, 31, 41],
          machine: [],
        },
      ];

      const metrics = await calculateSpatialMetricsAsync(mockHistory);

      expect(metrics).toBeDefined();
      expect(metrics.gridDensity).toHaveLength(91);
      expect(metrics.barycenter.x).toBeGreaterThanOrEqual(0);
      expect(metrics.barycenter.y).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(metrics.advancedClusters)).toBe(true);
      expect(Array.isArray(metrics.gravityWells)).toBe(true);
    });

    it('computes trajectory asynchronously with getBarycenterTrajectoryAsync', async () => {
      const mockHistory: DrawResult[] = [
        {
          id: 'd-1',
          date: '2026-01-01',
          drawName: 'Akwaba',
          gagnants: [10, 20, 30, 40, 50],
        },
      ];
      const traj = await getBarycenterTrajectoryAsync(mockHistory, 5);
      expect(traj).toHaveLength(1);
      expect(traj[0].x).toBeGreaterThanOrEqual(0);
      expect(traj[0].y).toBeGreaterThanOrEqual(0);
    });
  });
});
