import { describe, it, expect, beforeEach } from 'vitest';
import { globalCache } from '../src/services/cache/CacheService';
import {
  validateDrawRecord,
  auditHermeticPersistence,
  repairHermeticPersistence,
} from '../src/services/storage/hermeticStorageGuard';
import { getDrawNetworkId, areDrawsInSameNetwork } from '../src/config/networks';
import { DrawResult } from '../src/types';

describe('Axe 3 : Persistance, Données & Caching Hermétique (AGENTS.md)', () => {
  beforeEach(async () => {
    await globalCache.clearAll();
  });

  describe('1. Isolation Hermétique des Clés de Cache (AGENTS.md)', () => {
    it('génère des clés conformes à nexus_interdraw_${networkId}_${drawName}', () => {
      // Tirage Hebdomadaire (Monday Special)
      const keyHebdo = globalCache.getInterDrawKey('hebdomadaire', 'Monday Special');
      expect(keyHebdo).toBe('nexus_interdraw_hebdomadaire_monday_special');
      expect(globalCache.isHermeticInterDrawKey(keyHebdo)).toBe(true);

      // Tirage Quotidien (Reveil)
      const keyQuotidien = globalCache.getInterDrawKey('quotidien', 'Reveil');
      expect(keyQuotidien).toBe('nexus_interdraw_quotidien_reveil');
      expect(globalCache.isHermeticInterDrawKey(keyQuotidien)).toBe(true);
    });

    it('résout automatiquement le réseau canonique à partir du nom du tirage', () => {
      // Même si l'appelant passe une famille générique ou partielle, la clé se résout sur le réseau officiel
      const keyResolved1 = globalCache.getInterDrawKey('unknown', 'Lucky Tuesday');
      expect(keyResolved1).toBe('nexus_interdraw_hebdomadaire_lucky_tuesday');

      const keyResolved2 = globalCache.getInterDrawKey('unknown', 'Akwaba');
      expect(keyResolved2).toBe('nexus_interdraw_quotidien_akwaba');

      const keyResolved3 = globalCache.getInterDrawKey('unknown', 'TirageInconnuHorsReseau');
      expect(keyResolved3).toBe('nexus_interdraw_quotidien_tirageinconnuhorsreseau');
    });

    it('empêche la contamination croisée entre réseaux fermés', () => {
      expect(areDrawsInSameNetwork('Monday Special', 'National')).toBe(true);
      expect(areDrawsInSameNetwork('Reveil', 'Etoile')).toBe(true);

      // Croisement interdit : lundi 19h55 (Hebdo) et lundi 10h (Quotidien) sont étanches
      expect(areDrawsInSameNetwork('Monday Special', 'Reveil')).toBe(false);
      expect(getDrawNetworkId('Monday Special')).toBe('hebdomadaire');
      expect(getDrawNetworkId('Reveil')).toBe('quotidien');
    });
  });

  describe('2. Validation Stricte des Enregistrements de Tirages', () => {
    it('valide avec succès un tirage réel 5/90 conforme', () => {
      const validRow: DrawResult = {
        id: 'real-101',
        drawName: 'Reveil',
        date: '2026-10-25',
        gagnants: [12, 45, 67, 89, 3],
        machine: [4, 18],
      };

      const result = validateDrawRecord(validRow);
      expect(result.valid).toBe(true);
      expect(result.cleanDraw?.gagnants).toEqual([12, 45, 67, 89, 3]);
      expect(result.cleanDraw?.drawName).toBe('Reveil');
    });

    it('rejette les numéros hors bornes [1, 90]', () => {
      const invalidRow = {
        drawName: 'Reveil',
        date: '2026-10-25',
        gagnants: [0, 45, 67, 91, 3], // 0 et 91 hors-bornes
      };

      const result = validateDrawRecord(invalidRow);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.reason.includes('hors-bornes'))).toBe(true);
    });

    it('rejette les doublons au sein du même tirage', () => {
      const duplicateRow = {
        drawName: 'Reveil',
        date: '2026-10-25',
        gagnants: [12, 45, 12, 89, 3], // 12 en double
      };

      const result = validateDrawRecord(duplicateRow);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.reason.includes('doublon interne'))).toBe(true);
    });

    it('rejette strictement toute donnée synthétique (deterministic-*)', () => {
      const fakeRow = {
        id: 'deterministic-synthetic-draw-999',
        drawName: 'Reveil',
        date: '2026-10-25',
        gagnants: [1, 2, 3, 4, 5],
      };

      const result = validateDrawRecord(fakeRow);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.reason.includes('synthétique'))).toBe(true);
    });

    it('rejette les tirages incomplets (< 5 boules)', () => {
      const incompleteRow = {
        drawName: 'Reveil',
        date: '2026-10-25',
        gagnants: [10, 20, 30],
      };

      const result = validateDrawRecord(incompleteRow);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.reason.includes('Nombre de gagnants invalide'))).toBe(true);
    });
  });

  describe('3. Audit de Persistance & Auto-Réparation Hermétique', () => {
    it('exécute un audit d intégrité sans erreur', async () => {
      const audit = await auditHermeticPersistence();
      expect(audit).toBeDefined();
      expect(audit.timestamp).toBeGreaterThan(0);
      expect(audit.networkHermeticityScore).toBeGreaterThanOrEqual(0);
      expect(audit.networkHermeticityScore).toBeLessThanOrEqual(100);
      expect(['HEALTHY', 'DEGRADED', 'CORRUPTED']).toContain(audit.healthStatus);
    });

    it('exécute l auto-réparation hermétique et assainit le cache mémoire et stockage', async () => {
      const repair = await repairHermeticPersistence();
      expect(repair).toBeDefined();
      expect(repair.auditAfter).toBeDefined();
      expect(repair.purgedSyntheticCount).toBeGreaterThanOrEqual(0);
      expect(repair.deduplicatedCount).toBeGreaterThanOrEqual(0);
    });
  });
});
