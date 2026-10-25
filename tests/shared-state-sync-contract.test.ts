import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearStoreTimeline,
  getStoreDrawCount,
  getStoreFrequencies,
  getStoreCurrentGaps,
  getStoreTelemetry,
  isLotoEngineWasmReady,
} from '../src/services/wasm/lotoEngineBridge';
import { syncHistoryToRustStore } from '../src/services/lotteryService';
import { generateDeterministicFallbackHistory } from '../src/services/lotteryService';
import type { DrawResult } from '../src/types';

describe('CONTRAT ÉTAT PARTAGÉ (SHARED STATE) : SYNC ZÉRO-COPIE RUST/WASM', () => {
  const TEST_DRAW_KEY = 'TEST_SHARED_STATE_NATIONAL';

  beforeEach(() => {
    clearStoreTimeline(TEST_DRAW_KEY);
  });

  it('1. Synchronisation initiale : injecte l historique des tirages avec intégrité parfaite', () => {
    const rawHistory = generateDeterministicFallbackHistory(TEST_DRAW_KEY).slice(0, 30);
    expect(rawHistory.length).toBe(30);

    // Synchronisation vers le store natif
    syncHistoryToRustStore(rawHistory, TEST_DRAW_KEY);

    const count = getStoreDrawCount(TEST_DRAW_KEY);
    expect(count).toBe(30);

    const freqs = getStoreFrequencies(TEST_DRAW_KEY);
    expect(freqs.length).toBe(91);

    // Invariance combinatoire : 30 tirages de 5 boules = exactement 150 apparitions au total
    let totalAppearances = 0;
    for (let n = 1; n <= 90; n++) {
      totalAppearances += freqs[n];
      expect(freqs[n]).toBeGreaterThanOrEqual(0);
      expect(freqs[n]).toBeLessThanOrEqual(30);
    }
    expect(totalAppearances).toBe(150);
  });

  it('2. Idempotence absolue : une resynchronisation identique ne duplique aucun tirage ni fréquence', () => {
    const rawHistory = generateDeterministicFallbackHistory(TEST_DRAW_KEY).slice(0, 25);

    // Première synchronisation
    syncHistoryToRustStore(rawHistory, TEST_DRAW_KEY);
    const count1 = getStoreDrawCount(TEST_DRAW_KEY);
    const freqs1 = new Int32Array(getStoreFrequencies(TEST_DRAW_KEY));

    // Seconde synchronisation avec le même payload (no-op déterministe)
    syncHistoryToRustStore(rawHistory, TEST_DRAW_KEY);
    const count2 = getStoreDrawCount(TEST_DRAW_KEY);
    const freqs2 = getStoreFrequencies(TEST_DRAW_KEY);

    expect(count2).toBe(count1);
    for (let n = 1; n <= 90; n++) {
      expect(freqs2[n]).toBe(freqs1[n]);
    }
  });

  it('3. Synchronisation différentielle : l ajout d un nouveau tirage incrémente correctement le store', () => {
    const initialDraws: DrawResult[] = [
      {
        id: 'd1',
        drawName: TEST_DRAW_KEY,
        date: '2026-04-01',
        gagnants: [7, 14, 21, 28, 35],
        machine: [],
        version: 1,
      },
      {
        id: 'd2',
        drawName: TEST_DRAW_KEY,
        date: '2026-04-02',
        gagnants: [1, 2, 3, 4, 5],
        machine: [],
        version: 1,
      },
    ];

    syncHistoryToRustStore(initialDraws, TEST_DRAW_KEY);
    expect(getStoreDrawCount(TEST_DRAW_KEY)).toBe(2);

    const freqsBefore = getStoreFrequencies(TEST_DRAW_KEY);
    expect(freqsBefore[7]).toBe(1);
    expect(freqsBefore[90]).toBe(0);

    // Nouveau tirage ajouté au sommet (chronologie : le plus récent en premier)
    const updatedDraws: DrawResult[] = [
      {
        id: 'd3',
        drawName: TEST_DRAW_KEY,
        date: '2026-04-03',
        gagnants: [7, 20, 40, 60, 90],
        machine: [],
        version: 1,
      },
      ...initialDraws,
    ];

    syncHistoryToRustStore(updatedDraws, TEST_DRAW_KEY);
    expect(getStoreDrawCount(TEST_DRAW_KEY)).toBe(3);

    const freqsAfter = getStoreFrequencies(TEST_DRAW_KEY);
    expect(freqsAfter[7]).toBe(2); // Numéro 7 sorti 2 fois
    expect(freqsAfter[90]).toBe(1); // Numéro 90 sorti 1 fois
  });

  it('4. Cohérence des retards (gaps) après injection continue', () => {
    const rawHistory: DrawResult[] = [
      {
        id: 'd_recent',
        date: '2026-04-05',
        gagnants: [10, 20, 30, 40, 50],
        drawName: TEST_DRAW_KEY,
        machine: [],
      },
      {
        id: 'd_older',
        date: '2026-04-04',
        gagnants: [1, 2, 3, 4, 5],
        drawName: TEST_DRAW_KEY,
        machine: [],
      },
    ];

    syncHistoryToRustStore(rawHistory, TEST_DRAW_KEY);
    const gaps = getStoreCurrentGaps(TEST_DRAW_KEY);

    // Les numéros du tirage le plus récent [10, 20, 30, 40, 50] doivent avoir un retard de 0
    expect(gaps[10]).toBe(0);
    expect(gaps[20]).toBe(0);
    expect(gaps[30]).toBe(0);
    expect(gaps[40]).toBe(0);
    expect(gaps[50]).toBe(0);

    // Les numéros du tirage précédent [1, 2, 3, 4, 5] ont un retard de 1
    expect(gaps[1]).toBe(1);
    expect(gaps[2]).toBe(1);

    // Les numéros jamais apparus ont un retard égal à l'historique (2)
    expect(gaps[88]).toBe(2);
  });

  it('5. Télémétrie d état partagé : getStoreTelemetry fournit des métriques précises', () => {
    const rawHistory = generateDeterministicFallbackHistory(TEST_DRAW_KEY).slice(0, 20);
    syncHistoryToRustStore(rawHistory, TEST_DRAW_KEY);

    const telemetry = getStoreTelemetry(TEST_DRAW_KEY);
    expect(telemetry.drawName).toBe(TEST_DRAW_KEY);
    expect(telemetry.drawCount).toBe(20);
    expect(telemetry.frequencyCheckSum).toBe(100); // 20 * 5 = 100
    expect(telemetry.estimatedMemoryBytes).toBeGreaterThan(0);
    expect(['RUST_WASM', 'SIMD_FALLBACK']).toContain(telemetry.mode);
  });
});
