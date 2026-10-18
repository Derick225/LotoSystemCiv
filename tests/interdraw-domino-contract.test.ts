import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStoreNetworkId,
  getInterDrawCacheKey,
  computeInterDrawCouplingHpc,
  computeNetworkDominoHpc,
  appendSingleDrawToStore,
  clearStoreTimeline,
} from '../services/wasm/lotoEngineBridge';
import { runNativeRustPrediction } from '../services/prediction/predictionOrchestrator';
import { DrawResult } from '../types';

describe('Lot 2 : Interdraw Dynamics, Domino Effect & 100% Local Wasm Contract Tests', () => {
  const HEBDO_DRAW_1 = 'NATIONAL';
  const HEBDO_DRAW_2 = 'MIDWEEK';
  const QUOTIDIEN_DRAW = 'AKWABA';

  beforeEach(() => {
    clearStoreTimeline(HEBDO_DRAW_1);
    clearStoreTimeline(HEBDO_DRAW_2);
    clearStoreTimeline(QUOTIDIEN_DRAW);
  });

  it('1. Strict Cache Key Isolation: keys match nexus_interdraw_${networkId}_${drawName}', () => {
    const keyNational = getInterDrawCacheKey('NATIONAL');
    const keyMidweek = getInterDrawCacheKey('MIDWEEK');
    const keyAkwaba = getInterDrawCacheKey('AKWABA');
    const keySub = getInterDrawCacheKey('NATIONAL', 'domino');

    // Vérification du réseau hebdomadaire
    expect(getStoreNetworkId('NATIONAL')).toBe('hebdomadaire');
    expect(getStoreNetworkId('MIDWEEK')).toBe('hebdomadaire');
    expect(keyNational).toBe('nexus_interdraw_hebdomadaire_national');
    expect(keyMidweek).toBe('nexus_interdraw_hebdomadaire_midweek');
    expect(keySub).toBe('nexus_interdraw_hebdomadaire_national_domino');

    // Vérification du réseau quotidien
    expect(getStoreNetworkId('AKWABA')).toBe('quotidien');
    expect(keyAkwaba).toBe('nexus_interdraw_quotidien_akwaba');
  });

  it('2. Continuous Inter-Draw Coupling (C^∞): smooth Pearson coupling without binary threshold', () => {
    // Injecter des tirages pour NATIONAL et MIDWEEK
    for (let d = 1; d <= 10; d++) {
      appendSingleDrawToStore(
        HEBDO_DRAW_1,
        1700000000 + d * 86400,
        [d, d + 10, d + 20, d + 30, d + 40]
      );
      appendSingleDrawToStore(
        HEBDO_DRAW_2,
        1700000000 + d * 86400,
        [d + 1, d + 11, d + 21, d + 31, d + 41]
      );
    }

    const weight = computeInterDrawCouplingHpc(HEBDO_DRAW_1, HEBDO_DRAW_2);

    // Le poids de couplage doit être continu, strictement borné dans ]0, 1[
    expect(typeof weight).toBe('number');
    expect(weight).toBeGreaterThan(0.0);
    expect(weight).toBeLessThan(1.0);
    expect(Number.isFinite(weight)).toBe(true);
  });

  it('3. Domino Effect & Kinetic Advection: propagates kinetic waves and diacritic mirror reflections', () => {
    // Insérer un tirage avec le numéro 25
    appendSingleDrawToStore(
      HEBDO_DRAW_1,
      1700000000,
      [25, 40, 60, 75, 80]
    );

    const domino = computeNetworkDominoHpc(HEBDO_DRAW_1, 0.5);

    expect(domino.dominoEnergies.length).toBe(91);
    expect(domino.leadTriggerNumbers.length).toBeGreaterThan(0);
    expect(domino.kineticDissipationRate).toBeCloseTo(0.5, 2);

    // Le numéro direct 25 doit avoir reçu une impulsion
    expect(domino.dominoEnergies[25]).toBeGreaterThan(0);

    // Le miroir diacritique de 25 est 52, et son complémentaire 91-25 est 66 : ils doivent avoir reçu une onde
    expect(domino.dominoEnergies[52]).toBeGreaterThan(0);
    expect(domino.dominoEnergies[66]).toBeGreaterThan(0);
  });

  it('4. 100% Client Local Inference: runNativeRustPrediction executes in RAM in < 15ms with zero network call', async () => {
    const dummyHistory: DrawResult[] = [];
    for (let d = 1; d <= 25; d++) {
      dummyHistory.push({
        id: `h_${d}`,
        drawName: HEBDO_DRAW_1,
        date: `2026-03-${d < 10 ? '0' + d : d}`,
        gagnants: [
          ((d * 2) % 90) + 1,
          ((d * 5) % 90) + 1,
          ((d * 7) % 90) + 1,
          ((d * 11) % 90) + 1,
          ((d * 13) % 90) + 1,
        ],
        version: 1,
      });
    }

    const tStart = performance.now();
    const result = await runNativeRustPrediction(HEBDO_DRAW_1, dummyHistory);
    const duration = performance.now() - tStart;

    expect(result.top5).toHaveLength(5);
    expect(result.top10).toHaveLength(10);
    expect(result.scores.length).toBe(91);
    expect(result.confidenceScore).toBeGreaterThan(0);

    // Temps de calcul ultra-rapide en mémoire vive locale (zéro appel réseau)
    expect(duration).toBeLessThan(15);
  });
});
