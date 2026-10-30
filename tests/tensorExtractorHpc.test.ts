import { describe, it, expect, vi } from 'vitest';
import {
  computeTopologicalProximityVectorHpc,
  computeTensorScoreHpc,
  NUMBER_GEO_TABLE,
} from '../src/services/wasm/lotoEngineBridge';
import { buildTensorMatrix, buildTensorMatrixAsync } from '../src/services/training/tensorExtractor';
import { wasmHpcWorkerPool } from '../src/services/wasm/wasmHpcWorkerPool';
import { DrawResult } from '../src/types';

vi.mock('idb-keyval', () => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
}));

describe('Chantier D - Tensor Extractor Rust / WASM & HPC Integration', () => {
  describe('NUMBER_GEO_TABLE & Topological Proximity Vectorization', () => {
    it('doit pré-calculer correctement les coordonnées géométriques pour les 90 numéros', () => {
      expect(NUMBER_GEO_TABLE.length).toBe(91);

      // Numéro 1 : ligne 0, col 0, rev 1, mod10 1, decade 0
      expect(NUMBER_GEO_TABLE[1]).toEqual({
        row: 0,
        col: 0,
        rev: 1,
        mod10: 1,
        decade: 0,
      });

      // Numéro 12 : ligne 1, col 1, rev 21, mod10 2, decade 1
      expect(NUMBER_GEO_TABLE[12]).toEqual({
        row: 1,
        col: 1,
        rev: 21,
        mod10: 2,
        decade: 1,
      });

      // Numéro 90 : ligne 8, col 9, rev 9, mod10 0, decade 8
      expect(NUMBER_GEO_TABLE[90]).toEqual({
        row: 8,
        col: 9,
        rev: 9,
        mod10: 0,
        decade: 8,
      });
    });

    it('doit générer un vecteur de similarité topologique continu borné dans [0, 1]', () => {
      const winners = [7, 23, 42, 68, 89];
      const proximity = computeTopologicalProximityVectorHpc(winners);

      expect(proximity.length).toBe(91);

      // Les 5 gagnants exacts doivent avoir une similarité maximale de 1.0
      winners.forEach((w) => {
        expect(proximity[w]).toBe(1.0);
      });

      // Tous les numéros 1..90 doivent être strictement bornés dans [0, 1]
      for (let num = 1; num <= 90; num++) {
        expect(proximity[num]).toBeGreaterThanOrEqual(0);
        expect(proximity[num]).toBeLessThanOrEqual(1.0);
      }
    });

    it('doit capturer les relations miroirs, inversions et harmoniques sans nombres magiques arbitraires', () => {
      // Cas numéro 1 gagnant
      const proximity = computeTopologicalProximityVectorHpc([1]);

      // Miroir 91 : 90 + 1 = 91 => similarité d'au moins 0.45
      expect(proximity[90]).toBeGreaterThanOrEqual(0.45);

      // Cas numéro 12 gagnant
      const proximity12 = computeTopologicalProximityVectorHpc([12]);
      // Inverse arithmétique 21 => similarité d'au moins 0.40
      expect(proximity12[21]).toBeGreaterThanOrEqual(0.40);

      // Même harmonique mod-10 : 22 vs 12 => similarité d'au moins 0.35
      expect(proximity12[22]).toBeGreaterThanOrEqual(0.35);

      // Même dizaine : 19 vs 12 => similarité d'au moins 0.25
      expect(proximity12[19]).toBeGreaterThanOrEqual(0.25);
    });
  });

  describe('WASM / HPC Tensor Score Vectorization', () => {
    it('doit calculer le produit scalaire pondéré tensor_score_wasm avec zéro allocation', () => {
      const features = new Float64Array([0.8, 0.5, 0.2, 0.9, 0.4]);
      const weights = new Float64Array([0.3, 0.2, 0.1, 0.25, 0.15]);

      const expected = (0.8 * 0.3) + (0.5 * 0.2) + (0.2 * 0.1) + (0.9 * 0.25) + (0.4 * 0.15);
      const score = computeTensorScoreHpc(features, weights, 1, 5);

      expect(score[0]).toBeCloseTo(expected, 5);
    });

    it('doit supporter la délégation asynchrone via wasmHpcWorkerPool', async () => {
      const winners = [10, 20, 30, 40, 50];
      const resultVec = await wasmHpcWorkerPool.computeTopologicalProximityAsync(winners);
      expect(resultVec).toBeInstanceOf(Float64Array);
      expect(resultVec.length).toBe(91);
      expect(resultVec[10]).toBe(1.0);
      expect(resultVec[20]).toBe(1.0);

      const features = new Float64Array([1.0, 2.0, 3.0]);
      const weights = new Float64Array([0.5, 0.3, 0.2]);
      const scoreAsync = await wasmHpcWorkerPool.computeTensorScoreAsync(features, weights, 1, 3);
      expect(scoreAsync[0]).toBeCloseTo(1.7, 5);
    });
  });

  describe('buildTensorMatrixAsync (60 FPS Non-Blocking Extraction)', () => {
    it('doit extraire les tenseurs de manière asynchrone avec progression continue', async () => {
      const mockHistory: DrawResult[] = Array.from({ length: 40 }, (_, i) => ({
        id: `draw-${i}`,
        drawName: 'National',
        date: `2024-02-${40 - i}`,
        gagnants: [(i % 18) + 1, (i % 18) + 19, (i % 18) + 37, (i % 18) + 55, (i % 18) + 73],
        machine: [],
      }));

      const progressTicks: number[] = [];
      const tensors = await buildTensorMatrixAsync('National', mockHistory, 6, (p) => {
        progressTicks.push(p);
      });

      expect(tensors.length).toBe(6);
      expect(progressTicks.length).toBeGreaterThan(0);
      expect(progressTicks[progressTicks.length - 1]).toBe(100);

      // Vérification de la structure du tenseur
      expect(tensors[0].drawId).toBe('draw-0');
      expect(tensors[0].targetWinners).toEqual([1, 19, 37, 55, 73]);
      expect(tensors[0].matrix[1]).toBeDefined();

      // Vérification de cohérence entre buildTensorMatrix et buildTensorMatrixAsync
      const syncTensors = await buildTensorMatrix('National', mockHistory, 3);
      expect(syncTensors.length).toBe(3);
      expect(syncTensors[0].drawId).toBe(tensors[0].drawId);
      expect(syncTensors[0].targetWinners).toEqual(tensors[0].targetWinners);
    });
  });
});
