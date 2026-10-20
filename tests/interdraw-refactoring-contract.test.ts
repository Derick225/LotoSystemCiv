import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeBivariateCrossDyadsHpc,
  BivariateDyadsReportHpc,
  appendSingleDrawToStore,
  clearStoreTimeline,
  getStoreDrawCount
} from '../src/services/wasm/lotoEngineBridge';
import { globalCache } from '../src/services/cache/CacheService';
import { generateInterDrawReport } from '../src/services/interDrawService';
import {
  INTER_DRAW_NETWORKS,
  normalizeDrawName
} from '../src/constants';

describe('CONTRAT D ARCHITECTURE 4 PILIERS & MOTEUR RUST WASM : FLUX INTER-TIRAGES', () => {
  beforeEach(() => {
    clearStoreTimeline('BENEDICTION');
    clearStoreTimeline('PRESTIGE');
    clearStoreTimeline('NATIONAL');
    clearStoreTimeline('FRIDAY BONANZA');
  });

  describe('Pilier 3 : Moteur Rust WASM de Matrice Bivariée 90x90 & Dyades Croisées', () => {
    it('doit calculer une matrice de transition 90x90 de dimension exactement 8100', () => {
      // Injection de tirages synthétiques appariés
      const t0 = 1700000000;
      for (let i = 0; i < 20; i++) {
        const time = t0 + i * 86400;
        // Source avec numéros [1, 2, 3, 4, 5]
        appendSingleDrawToStore('BENEDICTION', time, [1, 2, 3, 4, 5], [10, 11, 12, 13, 14]);
        // Cible avec numéros [1, 6, 7, 8, 9] (report direct de 1 + dyades)
        appendSingleDrawToStore('PRESTIGE', time, [1, 6, 7, 8, 9], [20, 21, 22, 23, 24]);
      }

      const report: BivariateDyadsReportHpc = computeBivariateCrossDyadsHpc(
        'BENEDICTION',
        'PRESTIGE',
        0.0
      );

      expect(report).toBeDefined();
      expect(report.transitionMatrix.length).toBe(8100);
      expect(report.totalPairedDraws).toBe(20);
      expect(typeof report.meanCouplingZ).toBe('number');

      // Toutes les probabilités de la matrice doivent être finies et bornées dans [0, 1]
      for (let idx = 0; idx < 8100; idx++) {
        const p = report.transitionMatrix[idx];
        expect(p).toBeGreaterThanOrEqual(0.0);
        expect(p).toBeLessThanOrEqual(1.0);
        expect(Number.isFinite(p)).toBe(true);
      }
    });

    it('doit filtrer et ordonner les dyades croisées de manière strictement déterministe par z-score', () => {
      const t0 = 1700000000;
      for (let i = 0; i < 25; i++) {
        const time = t0 + i * 86400;
        // 42 -> 77 répété 20 fois
        const src = (i < 20) ? [42, 10, 20, 30, 40] : [11, 12, 13, 14, 15];
        const tgt = (i < 20) ? [77, 50, 60, 70, 80] : [51, 52, 53, 54, 55];
        appendSingleDrawToStore('BENEDICTION', time, src, [1, 2, 3, 4, 5]);
        appendSingleDrawToStore('PRESTIGE', time, tgt, [6, 7, 8, 9, 10]);
      }

      const repZ2 = computeBivariateCrossDyadsHpc('BENEDICTION', 'PRESTIGE', 2.0);
      expect(repZ2.dyads.length).toBeGreaterThan(0);

      // La dyade 42 -> 77 doit être présente avec un z-score massif
      const targetDyad = repZ2.dyads.find(d => d.sourceNumber === 42 && d.targetNumber === 77);
      expect(targetDyad).toBeDefined();
      expect(targetDyad!.occurrences).toBe(20);
      expect(targetDyad!.zScore).toBeGreaterThan(3.0);
      expect(targetDyad!.lift).toBeGreaterThan(5.0);
      expect(targetDyad!.significanceScore).toBeGreaterThan(95.0);

      // Vérification du tri décroissant par zScore
      for (let i = 1; i < repZ2.dyads.length; i++) {
        expect(repZ2.dyads[i - 1].zScore).toBeGreaterThanOrEqual(repZ2.dyads[i].zScore);
      }
    });

    it('doit éliminer le bruit stochastique lorsque le z-score minimum est appliqué', () => {
      const repAll = computeBivariateCrossDyadsHpc('BENEDICTION', 'PRESTIGE', -10.0);
      const repSig = computeBivariateCrossDyadsHpc('BENEDICTION', 'PRESTIGE', 1.96);

      // Le seuil de significativité doit filtrer strictement les fluctuations stochastiques nulles
      expect(repSig.dyads.length).toBeLessThanOrEqual(repAll.dyads.length);
      for (const d of repSig.dyads) {
        expect(d.zScore).toBeGreaterThanOrEqual(1.96);
      }
    });
  });

  describe('Isolation du Caching Hermétique (AGENTS.md)', () => {
    it('doit générer des clés de cache strictes incluant le réseau et le tirage', () => {
      const keyHebdo = globalCache.getInterDrawKey('hebdomadaire', 'NATIONAL');
      const keyQuotidien = globalCache.getInterDrawKey('quotidien', 'PRESTIGE');

      expect(keyHebdo).toContain('nexus_interdraw_hebdomadaire_national');
      expect(keyQuotidien).toContain('nexus_interdraw_quotidien_prestige');
      expect(keyHebdo).not.toBe(keyQuotidien);
    });
  });

  describe('Intégrité de la Structure en 4 Piliers Métiers', () => {
    it('doit exposer les 4 piliers dans le modèle de rapport unifié', async () => {
      const rep = await generateInterDrawReport('Fortune', 'quotidien');
      expect(rep).toBeDefined();

      if (rep) {
        // Pilier 1 : Matrice Réseau & Séquence
        expect(rep.networkId).toBe('quotidien');
        expect(rep.predecessor).toBeDefined();
        expect(rep.successor).toBeDefined();

        // Pilier 2 : Dynamiques Complexes (si calculé)
        // complexDynamics est optionnel mais typé
        expect('complexDynamics' in rep).toBe(true);

        // Pilier 3 : Dyades Croisées & Invariants
        expect('cooccurrenceMetrics' in rep).toBe(true);
        expect('patternMetrics' in rep).toBe(true);
        expect('bivariateHpcReport' in rep).toBe(true);
      }
    });
  });
});
