import { describe, it, expect, beforeEach } from 'vitest';
import {
  appendSingleDrawToStore,
  getStoreFrequencies,
  getStoreCurrentGaps,
  getStoreDrawCount,
  clearStoreTimeline,
  runNativePredictionHpc,
  analyzeDrawHistoryHpc,
  generateDiversifiedPortfolioHpc,
  readWasmField,
} from '../src/services/wasm/lotoEngineBridge';
import { syncHistoryToRustStore } from '../src/services/lotteryService';
import { DrawResult } from '../src/types';

describe('Store Integrity & Probability Contract Tests', () => {
  const TEST_DRAW = 'TEST_NATIONAL_INTEGRITY';

  beforeEach(() => {
    clearStoreTimeline(TEST_DRAW);
  });

  it('1. Invariance & Strict Deduplication: repeated sync does not duplicate frequencies', () => {
    const draws: DrawResult[] = [
      {
        id: 'd1',
        drawName: TEST_DRAW,
        date: '2026-03-01',
        gagnants: [10, 20, 30, 40, 50],
        machine: [1, 2, 3, 4, 5],
        version: 1,
      },
      {
        id: 'd2',
        drawName: TEST_DRAW,
        date: '2026-03-02',
        gagnants: [10, 21, 31, 41, 51],
        machine: [6, 7, 8, 9, 11],
        version: 1,
      },
      {
        id: 'd3',
        drawName: TEST_DRAW,
        date: '2026-03-03',
        gagnants: [10, 22, 32, 42, 52],
        machine: [12, 13, 14, 15, 16],
        version: 1,
      },
    ];

    // Première synchronisation
    syncHistoryToRustStore(draws, TEST_DRAW);
    const count1 = getStoreDrawCount(TEST_DRAW);
    const freqs1 = getStoreFrequencies(TEST_DRAW);

    expect(count1).toBe(3);
    expect(freqs1[10]).toBe(3); // Présent dans les 3 tirages
    expect(freqs1[20]).toBe(1);

    // Seconde synchronisation (exactement les mêmes tirages)
    syncHistoryToRustStore(draws, TEST_DRAW);
    const count2 = getStoreDrawCount(TEST_DRAW);
    const freqs2 = getStoreFrequencies(TEST_DRAW);

    // Les fréquences et le compteur doivent rester STRICTEMENT invariants
    expect(count2).toBe(3);
    expect(freqs2[10]).toBe(3);
    expect(freqs2[20]).toBe(1);
    expect(freqs2[50]).toBe(1);
  });

  it('2. Chronological Ordering: gaps are measured relative to the most recent draw', () => {
    // Les tirages arrivent typiquement de Supabase dans l'ordre antéchronologique (le plus récent en premier)
    const antéchronologique: DrawResult[] = [
      {
        id: 'newest',
        drawName: TEST_DRAW,
        date: '2026-03-05',
        gagnants: [5, 15, 25, 35, 45], // 5 est présent au tirage le plus récent -> gap = 0
        version: 1,
      },
      {
        id: 'middle',
        drawName: TEST_DRAW,
        date: '2026-03-04',
        gagnants: [1, 2, 3, 4, 90], // 90 était présent ici -> gap = 1
        version: 1,
      },
      {
        id: 'oldest',
        drawName: TEST_DRAW,
        date: '2026-03-01',
        gagnants: [7, 8, 9, 10, 11], // 7 était présent au plus vieux -> gap = 2
        version: 1,
      },
    ];

    syncHistoryToRustStore(antéchronologique, TEST_DRAW);
    const gaps = getStoreCurrentGaps(TEST_DRAW);

    // 5 est sorti au tirage le plus récent : son écart actuel doit être 0
    expect(gaps[5]).toBe(0);
    // 90 est sorti il y a 1 tirage : son écart actuel doit être 1
    expect(gaps[90]).toBe(1);
    // 7 est sorti il y a 2 tirages : son écart actuel doit être 2
    expect(gaps[7]).toBe(2);
  });

  it('3. Polymorphic Getter Accessor (readWasmField): zero TypeError on functions vs properties', () => {
    // Cas 1 : objet avec getter sous forme de méthode
    const objWithMethod = {
      top_5: () => [11, 22, 33, 44, 55],
      regime: () => 'CHAOTIC',
    };
    expect(readWasmField(objWithMethod, 'top_5', [])).toEqual([11, 22, 33, 44, 55]);
    expect(readWasmField(objWithMethod, 'regime', 'DEFAULT')).toBe('CHAOTIC');

    // Cas 2 : objet avec propriété directe (comme généré par wasm-bindgen)
    const objWithProp = {
      top_5: [1, 2, 3, 4, 5],
      regime: 'DIFFUSION',
    };
    expect(readWasmField(objWithProp, 'top_5', [])).toEqual([1, 2, 3, 4, 5]);
    expect(readWasmField(objWithProp, 'regime', 'DEFAULT')).toBe('DIFFUSION');

    // Cas 3 : propriété absente -> retourne le fallback sans lever d'exception
    expect(readWasmField(objWithProp, 'non_existent', 42)).toBe(42);
    expect(readWasmField(null, 'any_prop', 'safe')).toBe('safe');
  });

  it('4. Zero Synthetic Predictions: returns empty on empty dataset instead of fabricated [1,2,3,4,5]', () => {
    const emptyResult = runNativePredictionHpc({
      flatWinners: new Uint8Array([]),
      numDraws: 0,
    });

    expect(emptyResult.top5).toEqual([]);
    expect(emptyResult.top10).toEqual([]);
    expect(emptyResult.confidenceScore).toBe(0);
  });

  it('5. Marginal Probability Simplex: sum of 90 probabilities equals exactly 5.0 (5-ball draw)', () => {
    const numDraws = 20;
    const flat = new Uint8Array(numDraws * 5);
    for (let d = 0; d < numDraws; d++) {
      for (let c = 0; c < 5; c++) {
        flat[d * 5 + c] = ((d * 7 + c * 13) % 90) + 1;
      }
    }

    const pred = runNativePredictionHpc({
      flatWinners: flat,
      numDraws,
      frequencyWeight: 1.0,
      gapWeight: 1.0,
    });

    expect(pred.top5).toHaveLength(5);
    expect(pred.scores.length).toBe(91);

    // Somme des probabilités marginales P(numéro i inclus dans le tirage) pour les 90 boules
    let sumMarginal = 0;
    for (let n = 1; n <= 90; n++) {
      const p = pred.scores[n];
      expect(p).toBeGreaterThanOrEqual(0.0);
      expect(p).toBeLessThanOrEqual(1.0);
      sumMarginal += p;
    }

    // Dans un tirage 5/90 sans remise, la somme exacte des espérances d'inclusion E[X] = 5
    expect(sumMarginal).toBeCloseTo(5.0, 4);
  });

  it('6. Multi-Ticket Diversification: generates orthogonal tickets with high Jaccard distance', () => {
    // Insérer 15 tirages dans le store
    const draws: DrawResult[] = [];
    for (let d = 1; d <= 15; d++) {
      draws.push({
        id: `draw_${d}`,
        drawName: TEST_DRAW,
        date: `2026-03-${d < 10 ? '0' + d : d}`,
        gagnants: [
          ((d * 3) % 90) + 1,
          ((d * 7 + 5) % 90) + 1,
          ((d * 11 + 10) % 90) + 1,
          ((d * 13 + 15) % 90) + 1,
          ((d * 17 + 20) % 90) + 1,
        ],
        version: 1,
      });
    }

    syncHistoryToRustStore(draws, TEST_DRAW);

    const portfolio = generateDiversifiedPortfolioHpc(TEST_DRAW, 5);

    expect(portfolio.ticketCount).toBe(5);
    expect(portfolio.tickets).toHaveLength(5);
    portfolio.tickets.forEach(ticket => {
      expect(ticket).toHaveLength(5);
      // Tous les numéros dans [1..90]
      ticket.forEach(num => {
        expect(num).toBeGreaterThanOrEqual(1);
        expect(num).toBeLessThanOrEqual(90);
      });
      // 5 numéros distincts par ticket
      expect(new Set(ticket).size).toBe(5);
    });

    // Distance de Jaccard élevée (diversité anti-monoculture)
    expect(portfolio.diversityJaccardDistance).toBeGreaterThan(0.70);
    // Couverture minimale de numéros distincts sur les 5 tickets
    expect(portfolio.uniqueNumbersCovered).toBeGreaterThanOrEqual(18);
  });
});
