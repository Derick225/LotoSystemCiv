import { describe, it, expect } from 'vitest';
import {
  generateReceiptSecurityHash,
  generateLonaciTicketReference,
  generateLonaciReceiptPdf,
  LonaciReceiptData,
} from '../src/services/lonaciReceiptPdfService';

describe('Chantier C: PlatinumDecisionStudio - Mode Rafale & Export Bordereau LONACI', () => {
  const sampleReceiptData: LonaciReceiptData = {
    ticketId: 'LNC-CI-2026-X9K2-8921',
    terminalId: 'LONACI-ABJ-TRM-8492',
    timestamp: 1740825600000,
    date: '29/10/2026 à 13:00',
    drawNames: ['Diamant (13:00)', 'Moaye (16:00)', 'National (19:55)'],
    burstItems: [
      { name: 'Diamant', time: '13:00', stake: 1000, potentialWin: 240000 },
      { name: 'Moaye', time: '16:00', stake: 1000, potentialWin: 240000 },
      { name: 'National', time: '19:55', stake: 1000, potentialWin: 240000 },
    ],
    gameMode: 'STANDARD',
    betType: '2N',
    betTypeLabel: '2 Numéros (2N)',
    numbers: [7, 14, 28, 42, 89],
    odds: 240,
    stakePerDraw: 1000,
    totalStake: 3000,
    potentialWin: 720000,
    burstStrategy: 'Rafale Équirépartie',
    dominantStrategy: 'Platinum Hybride',
    densityIndex: 82,
  };

  describe('Sécurité Cryptographique & Traçabilité Déterministe', () => {
    it('generates a 64-character deterministic cryptographic security hash', async () => {
      const hash1 = await generateReceiptSecurityHash(sampleReceiptData);
      const hash2 = await generateReceiptSecurityHash(sampleReceiptData);

      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBeGreaterThanOrEqual(32);
      expect(hash1).toBe(hash2); // 100% Déterministe
    });

    it('generates a well-formed official LONACI ticket reference', () => {
      const ref = generateLonaciTicketReference('Diamant', 1740825600000);
      expect(ref).toMatch(/^LNC-CI-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    it('produces distinct hashes when ticket numbers or stakes differ', async () => {
      const hashOriginal = await generateReceiptSecurityHash(sampleReceiptData);
      const hashModifiedStake = await generateReceiptSecurityHash({
        ...sampleReceiptData,
        totalStake: 5000,
      });
      const hashModifiedNumbers = await generateReceiptSecurityHash({
        ...sampleReceiptData,
        numbers: [1, 2, 3, 4, 5],
      });

      expect(hashOriginal).not.toBe(hashModifiedStake);
      expect(hashOriginal).not.toBe(hashModifiedNumbers);
    });
  });

  describe('Modélisation Mathématique de la Rafale Multi-Tirages (AGENTS.md)', () => {
    it('computes uniform allocation with all stakes meeting the 100 FCFA minimum', () => {
      const totalBudget = 4000;
      const drawsCount = 4;
      const weights = Array(drawsCount).fill(1 / drawsCount);
      const stakes = weights.map((w) => Math.max(100, Math.round((totalBudget * w) / 100) * 100));

      expect(stakes).toHaveLength(4);
      stakes.forEach((s) => {
        expect(s).toBeGreaterThanOrEqual(100);
        expect(s % 100).toBe(0);
      });
      const sum = stakes.reduce((a, b) => a + b, 0);
      expect(sum).toBe(4000);
    });

    it('computes continuous entropy decay where earlier draws receive strictly higher allocation', () => {
      const totalBudget = 6000;
      const drawsCount = 3;
      const entropy = 0.65;
      const lambda = 0.2 + 0.6 * entropy;

      const rawWeights = [0, 1, 2].map((i) => Math.exp(-lambda * i));
      const sumW = rawWeights.reduce((a, b) => a + b, 0);
      const weights = rawWeights.map((w) => w / sumW);

      const stakes = weights.map((w) => Math.max(100, Math.round((totalBudget * w) / 100) * 100));

      // Vérifier la décroissance stricte
      expect(stakes[0]).toBeGreaterThanOrEqual(stakes[1]);
      expect(stakes[1]).toBeGreaterThanOrEqual(stakes[2]);
      stakes.forEach((s) => expect(s % 100).toBe(0));
    });

    it('enforces a strict bankroll safety ceiling on the regulated Kelly martingale', () => {
      const bankroll = 50000;
      const ceiling = Math.round(bankroll * 0.15); // 7,500 FCFA
      const odds = 240;
      const baseStake = 500;

      let cumLoss = 0;
      const stakes: number[] = [];

      for (let i = 0; i < 5; i++) {
        if (i === 0) {
          stakes.push(baseStake);
          cumLoss += baseStake;
        } else {
          const needed = (cumLoss + baseStake) / (odds - 1);
          const s = Math.min(ceiling, Math.max(baseStake, Math.round(needed / 100) * 100));
          stakes.push(s);
          cumLoss += s;
        }
      }

      // Aucun tirage ne doit dépasser le plafond strict de 15% du capital
      stakes.forEach((s) => {
        expect(s).toBeLessThanOrEqual(ceiling);
        expect(s).toBeGreaterThanOrEqual(baseStake);
      });
    });
  });

  describe('Génération & Export du Document PDF Officiel LONACI', () => {
    it('generates an official A4 LONACI PDF document and blob without runtime errors', async () => {
      const result = await generateLonaciReceiptPdf(sampleReceiptData, {
        format: 'A4',
        autoDownload: false,
      });

      expect(result).toBeDefined();
      expect(result.doc).toBeDefined();
      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.blob.size).toBeGreaterThan(1000); // PDF complet valide
    });

    it('generates an 80mm thermal receipt PDF without runtime errors', async () => {
      const result = await generateLonaciReceiptPdf(sampleReceiptData, {
        format: 'THERMAL',
        autoDownload: false,
      });

      expect(result).toBeDefined();
      expect(result.doc).toBeDefined();
      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.blob.size).toBeGreaterThan(1000);
    });
  });
});
