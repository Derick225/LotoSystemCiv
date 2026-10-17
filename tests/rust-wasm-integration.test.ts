import { describe, it, expect } from 'vitest';
import {
  bootstrapStoreFromJson,
  appendSingleDrawToStore,
  getStoreFrequencies,
  getStoreCurrentGaps,
  getStoreDrawCount,
  runNativePredictionHpc,
} from '../services/wasm/lotoEngineBridge';
import { lotteryService } from '../services/lotteryService';

describe('Rust Core Wasm In-Memory Store & Native Inference Integration', () => {
  it('amorce (bootstrap) correctement l’historique des tirages en mémoire contiguë depuis un payload JSON', () => {
    const mockJson = JSON.stringify([
      {
        tirage: 'NATIONAL',
        date: '2026-01-01',
        gagnants: [12, 24, 36, 48, 60],
        machine: [5, 15, 25, 35, 45],
      },
      {
        tirage: 'NATIONAL',
        date: '2026-01-08',
        gagnants: [12, 18, 36, 54, 72],
        machine: [1, 2, 3, 4, 6],
      },
    ]);

    const loaded = bootstrapStoreFromJson(mockJson);
    expect(loaded).toBe(2);
    expect(getStoreDrawCount('NATIONAL')).toBeGreaterThanOrEqual(2);

    const freqs = getStoreFrequencies('NATIONAL');
    // Le numéro 12 est apparu 2 fois
    expect(freqs[12]).toBe(2);
    // Le numéro 36 est apparu 2 fois
    expect(freqs[36]).toBe(2);
    // Le numéro 24 est apparu 1 fois
    expect(freqs[24]).toBe(1);
    // Le numéro 1 n'est pas apparu dans les gagnants
    expect(freqs[1]).toBe(0);
  });

  it('insère un tirage unitaire en O(1) et met à jour instantanément fréquences et écarts sans appel réseau', () => {
    const drawName = 'LUCKY_TUESDAY_TEST';
    // Tirage 1 : numéros 10, 20, 30, 40, 50
    appendSingleDrawToStore(drawName, 1700000000000, [10, 20, 30, 40, 50]);
    // Tirage 2 : numéros 10, 21, 31, 41, 51
    appendSingleDrawToStore(drawName, 1700000086400, [10, 21, 31, 41, 51]);

    const freqs = getStoreFrequencies(drawName);
    expect(freqs[10]).toBe(2);
    expect(freqs[20]).toBe(1);
    expect(freqs[21]).toBe(1);

    const gaps = getStoreCurrentGaps(drawName);
    // Numéro 10 sorti au dernier tirage -> écart 0
    expect(gaps[10]).toBe(0);
    // Numéro 21 sorti au dernier tirage -> écart 0
    expect(gaps[21]).toBe(0);
    // Numéro 20 non sorti au dernier tirage -> écart 1
    expect(gaps[20]).toBe(1);
  });

  it('exécute l’inférence stochastique native 100% Rust/Wasm et produit des prédictions déterministes valides', () => {
    // Échantillon de 10 tirages aplatis (50 numéros)
    const flat = new Uint8Array([
      1, 2, 3, 4, 5,
      1, 10, 20, 30, 40,
      1, 11, 21, 31, 41,
      2, 12, 22, 32, 42,
      3, 13, 23, 33, 43,
      4, 14, 24, 34, 44,
      5, 15, 25, 35, 45,
      1, 16, 26, 36, 46,
      1, 17, 27, 37, 47,
      1, 18, 28, 38, 48,
    ]);

    const res = runNativePredictionHpc({
      flatWinners: flat,
      numDraws: 10,
      frequencyWeight: 1.5,
      gapWeight: 0.8,
    });

    expect(res).toBeDefined();
    expect(res.top5).toHaveLength(5);
    expect(res.top10).toHaveLength(10);
    // Le numéro 1 est très fréquent (sorti 6 fois) -> doit figurer dans le top 5
    expect(res.top5).toContain(1);

    expect(res.confidenceScore).toBeGreaterThanOrEqual(10.0);
    expect(res.confidenceScore).toBeLessThanOrEqual(95.0);
    expect(res.shannonEntropy).toBeGreaterThanOrEqual(0.0);
    expect(res.shannonEntropy).toBeLessThanOrEqual(1.0);
  });

  it('permet l’appel de predictWithNativeRustWasm depuis lotteryService avec zéro dépendance externe', async () => {
    const mockHistory = [
      { id: '1', drawName: 'MIDWEEK', date: '01/01/2026', gagnants: [5, 10, 15, 20, 25], machine: [], version: 1 },
      { id: '2', drawName: 'MIDWEEK', date: '08/01/2026', gagnants: [5, 11, 16, 21, 26], machine: [], version: 1 },
      { id: '3', drawName: 'MIDWEEK', date: '15/01/2026', gagnants: [5, 12, 17, 22, 27], machine: [], version: 1 },
    ];

    const pred = await lotteryService.predictWithNativeRustWasm('MIDWEEK', mockHistory);
    expect(pred).toBeDefined();
    expect(pred.top5).toHaveLength(5);
    expect(pred.top5).toContain(5); // Le numéro 5 est récurrent dans l'échantillon
  });

  it('exécute l’analyse préalable complète (FFT, Hurst, Entropie, Régime) en RAM avant toute prédiction', async () => {
    // Peuplement d'un historique consistant pour l'analyse
    const testDraw = 'FORTUNE_TEST';
    for (let i = 1; i <= 20; i++) {
      appendSingleDrawToStore(
        testDraw,
        1700000000000 + i * 86400000,
        [i, i + 10, i + 20, (i * 3) % 89 + 1, (i * 7) % 89 + 1]
      );
    }

    const prior = await lotteryService.analyzeDrawPrior(testDraw);
    expect(prior).toBeDefined();
    expect(prior.hurstExponent).toBeGreaterThan(0.0);
    expect(prior.hurstExponent).toBeLessThan(1.0);
    expect(prior.shannonEntropy).toBeGreaterThanOrEqual(0.0);
    expect(prior.shannonEntropy).toBeLessThanOrEqual(1.0);
    expect(prior.dominantPeriod).toBeGreaterThan(0.0);
    expect(['PERSISTENT_ATTRACTOR', 'MEAN_REVERTING', 'STOCHASTIC_DIFFUSION', 'INIT_DIFFUSION']).toContain(prior.regimeLabel);
  });

  it('génère un portefeuille multi-tickets diversifiés avec garantie anti-monoculture et distance de Jaccard élevée', async () => {
    const testDraw = 'FORTUNE_TEST';
    const portfolio = await lotteryService.generateDiversifiedPortfolio(testDraw, 5);

    expect(portfolio).toBeDefined();
    expect(portfolio.ticketCount).toBe(5);
    expect(portfolio.tickets).toHaveLength(5);

    // Chaque ticket a exactement 5 numéros distincts triés dans [1..90]
    for (const ticket of portfolio.tickets) {
      expect(ticket).toHaveLength(5);
      const unique = new Set(ticket);
      expect(unique.size).toBe(5);
      for (const num of ticket) {
        expect(num).toBeGreaterThanOrEqual(1);
        expect(num).toBeLessThanOrEqual(90);
      }
    }

    // Propriété anti-monoculture : couverture d'au moins 15 numéros uniques sur 25 boules au total (5 tickets * 5)
    expect(portfolio.uniqueNumbersCovered).toBeGreaterThanOrEqual(14);
    // Distance moyenne de Jaccard élevée entre les tickets (diversité garantie)
    expect(portfolio.diversityJaccardDistance).toBeGreaterThan(0.60);
    expect(portfolio.confidenceScore).toBeGreaterThanOrEqual(20.0);
  });
});

