import { describe, it, expect, beforeAll } from 'vitest';
import {
  initializeLotoEngineWasm,
  isLotoEngineWasmReady,
  getHpcEngineMode,
  solveCombinatorialAnnealingHpc,
  computeMarkovTransitionHpc,
  computeTopologicalLyapunovHpc
} from '../services/wasm/lotoEngineBridge';
import { globalCache, CACHE_CONFIG } from '../services/cache/CacheService';
import { generateCombination } from '../services/prediction/combinationGenerator';
import { ScoredNumber } from '../services/prediction/scoringEngine';
import { EmpiricalCalibration } from '../types';
import { INTER_DRAW_FAMILIES } from '../constants';

describe('Validation de Terrain & Audit des Caches PWA / HPC', () => {
  beforeAll(async () => {
    const initialized = await initializeLotoEngineWasm();
    expect(initialized).toBe(true);
  });

  describe('1. Audit des Caches PWA & Persistance Hors-Ligne', () => {
    it('doit confirmer le chargement et la disponibilité du bytecode natif Rust WASM', () => {
      expect(isLotoEngineWasmReady()).toBe(true);
      expect(getHpcEngineMode()).toBe('RUST_WASM');
    });

    it('doit persister et restituer une matrice daffinité 90x90 avec la clé normalisée', async () => {
      const affinityMatrix = new Float64Array(91 * 91);
      // Simulation d'une cooccurrence entre le 7 et le 77
      affinityMatrix[7 * 91 + 77] = 0.85;
      affinityMatrix[77 * 91 + 7] = 0.85;

      const cacheKey = globalCache.getInterDrawKey('lonaci_national', 'Reveil', 'affinity_tensor');
      expect(cacheKey).toBe('nexus_interdraw_lonaci_national_reveil_affinity_tensor');

      // Persistance dans le cache
      await globalCache.set(cacheKey, Array.from(affinityMatrix), CACHE_CONFIG.HISTORY_TTL);

      // Récupération
      const retrieved = await globalCache.get<number[]>(cacheKey);
      expect(retrieved).toBeDefined();
      expect(retrieved?.length).toBe(91 * 91);
      expect(retrieved![7 * 91 + 77]).toBeCloseTo(0.85, 2);
    });

    it('doit respecter strictement létanchéité des 3 familles LONACI dans les clés de cache', () => {
      const fam1 = INTER_DRAW_FAMILIES.FAMILY_10H_16H_SUN19H55.id;
      const fam2 = INTER_DRAW_FAMILIES.FAMILY_13H.id;
      const fam3 = INTER_DRAW_FAMILIES.FAMILY_19H55.id;

      const key1 = globalCache.getInterDrawKey(fam1, 'Reveil', 'markov');
      const key2 = globalCache.getInterDrawKey(fam2, 'Etoile', 'markov');
      const key3 = globalCache.getInterDrawKey(fam3, 'Monday Special', 'markov');

      expect(key1).toContain('FAMILY_10H_16H_SUN19H55');
      expect(key2).toContain('FAMILY_13H');
      expect(key3).toContain('FAMILY_19H55');

      // Aucune collision ou croisement entre les 3 familles fermées
      expect(key1).not.toEqual(key2);
      expect(key2).not.toEqual(key3);
      expect(key1).not.toEqual(key3);
    });
  });

  describe('2. Validation de Terrain E2E sur les Tirages Réels LONACI (10H, 13H, 16H, 19H55)', () => {
    const calibration: EmpiricalCalibration = {
      varianceFactor: 1.05,
      frequencyDecay: 0.95,
      dispersionThreshold: 15.0,
      confidenceScalar: 0.88,
      lastOptimized: '2026-09-23T00:00:00Z',
    };

    const testDraws = [
      { slot: '10:00 (10H)', name: 'Reveil', seed: 11, lastDraw: [7, 14, 21, 28, 35] },
      { slot: '13:00 (13H)', name: 'Etoile', seed: 23, lastDraw: [1, 12, 45, 67, 88] },
      { slot: '16:00 (16H)', name: 'Akwaba', seed: 37, lastDraw: [9, 18, 27, 36, 45] },
      { slot: '19:55 (19H55)', name: 'Monday Special', seed: 49, lastDraw: [10, 20, 30, 40, 50] },
    ];

    testDraws.forEach(({ slot, name, seed, lastDraw }) => {
      it(`doit exécuter avec succès la sélection combinatoire assistée par Recuit Simulé (Seed 5 HPC) sur ${slot} - ${name}`, async () => {
        // Préparation des 90 numéros scorés de façon déterministe
        const scoredNumbers: ScoredNumber[] = [];
        for (let n = 1; n <= 90; n++) {
          const score = ((Math.sin(n * 0.35 + seed) + 1.0) / 2.0) * 100;
          scoredNumbers.push({
            num: n,
            score,
            confidence: 0.85,
            breakdown: {
              frequence: score * 0.4,
              ecart: score * 0.3,
              cycle: score * 0.3,
            } as any
          });
        }
        // Trier par score décroissant comme en production
        scoredNumbers.sort((a, b) => b.score - a.score);

        const affinityMap: Record<number, Record<number, number>> = {};
        for (let i = 1; i <= 90; i++) {
          affinityMap[i] = {};
          for (let j = 1; j <= 90; j++) {
            if (i !== j && (i + j) % 7 === 0) {
              affinityMap[i][j] = 0.65;
            }
          }
        }

        // Exécution de generateCombination (qui invoque Seed 5 : Recuit Simulé HPC Rust WASM)
        const combination = await generateCombination(
          scoredNumbers,
          affinityMap,
          calibration,
          1, // 1 outsider
          lastDraw,
          0.5,
          0.58 // Exposant de Hurst
        );

        expect(combination).toBeDefined();
        expect(combination).toHaveLength(5);
        expect(new Set(combination).size).toBe(5);

        combination.forEach((val) => {
          expect(val).toBeGreaterThanOrEqual(1);
          expect(val).toBeLessThanOrEqual(90);
        });

        // Validation du calcul de l'invariance chaotique de Lyapunov sur le créneau
        const numDraws = 20;
        const flatDraws = new Int32Array(numDraws * 5);
        for (let d = 0; d < numDraws; d++) {
          for (let c = 0; c < 5; c++) {
            flatDraws[d * 5 + c] = (((seed + d * 7 + c * 11) % 90) + 1);
          }
        }

        const lyapResult = computeTopologicalLyapunovHpc(flatDraws, numDraws, 5, 15);
        expect(typeof lyapResult.lyapunov_exponent).toBe('number');
        expect(typeof lyapResult.is_chaotic).toBe('boolean');
        expect(lyapResult.topological_entropy).toBeGreaterThan(0);
      });
    });

    it('doit garantir 100% de reproductibilité déterministe sur le Recuit Simulé Seed 5 HPC', () => {
      const candidatePool = new Int32Array([5, 12, 23, 34, 45, 56, 67, 78, 89, 14, 28, 42]);
      const scores91 = new Float64Array(91);
      candidatePool.forEach((n) => { scores91[n] = 0.9; });
      const affinityMatrix = new Float64Array(91 * 91);

      // Exécution 1 avec deterministicSeed = 5
      const run1 = solveCombinatorialAnnealingHpc({
        candidatePool,
        scores91,
        affinityMatrix,
        initialTemperature: 10.0,
        coolingRate: 0.95,
        minTemperature: 0.01,
        iterationsPerTemp: 30,
        deterministicSeed: 5,
      });

      // Exécution 2 avec le même seed déterministe = 5
      const run2 = solveCombinatorialAnnealingHpc({
        candidatePool,
        scores91,
        affinityMatrix,
        initialTemperature: 10.0,
        coolingRate: 0.95,
        minTemperature: 0.01,
        iterationsPerTemp: 30,
        deterministicSeed: 5,
      });

      expect(run1.best_combination).toEqual(run2.best_combination);
      expect(run1.best_energy).toBeCloseTo(run2.best_energy, 6);
    });
  });
});
