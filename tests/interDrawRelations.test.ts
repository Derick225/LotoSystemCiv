import { describe, it, expect } from 'vitest';
import {
  INTER_DRAW_FAMILIES,
  getInterDrawFamiliesForDraw,
  getFamilyPredecessorAndSuccessor,
  normalizeDrawName
} from '../constants';
import {
  getMirrorNumber,
  getComplement90,
  generateInterDrawReport
} from '../services/interDrawService';

describe('CADRE DES RELATIONS INTER-TIRAGES (3 FAMILLES ÉTANCHES)', () => {
  it('doit avoir exactement les 3 familles demandées par le client', () => {
    const familyIds = Object.keys(INTER_DRAW_FAMILIES);
    expect(familyIds).toContain('FAMILY_10H_16H_SUN19H55');
    expect(familyIds).toContain('FAMILY_13H');
    expect(familyIds).toContain('FAMILY_19H55');
    expect(familyIds.length).toBe(3);
  });

  describe('Famille 1: 10H, 16H et uniquement le Dimanche 19H55', () => {
    const fam = INTER_DRAW_FAMILIES.FAMILY_10H_16H_SUN19H55;

    it('doit contenir exactement 15 tirages dans sa séquence', () => {
      // 7 jours * 2 créneaux (10H + 16H) + Dimanche 19H55 = 15 tirages
      expect(fam.sequence.length).toBe(15);
    });

    it('doit inclure le tirage Espoir du Dimanche à 19H55', () => {
      const sun19h55 = fam.sequence.find(s => s.day === 'Dimanche' && s.time === '19:55');
      expect(sun19h55).toBeDefined();
      expect(sun19h55?.name).toBe('Espoir');
    });

    it('ne doit contenir aucun tirage de 19H55 du Lundi au Samedi', () => {
      const other19h55 = fam.sequence.filter(s => s.time === '19:55' && s.day !== 'Dimanche');
      expect(other19h55.length).toBe(0);
    });

    it('doit fermer le cycle temporel (le successeur du dernier est le premier)', () => {
      const lastDraw = fam.sequence[fam.sequence.length - 1];
      const rel = getFamilyPredecessorAndSuccessor(lastDraw.name, 'FAMILY_10H_16H_SUN19H55');
      expect(rel).toBeDefined();
      expect(rel?.successor.name).toBe(fam.sequence[0].name);
    });
  });

  describe('Famille 2: Tirages de 13H exclusivement (Zénith)', () => {
    const fam = INTER_DRAW_FAMILIES.FAMILY_13H;

    it('doit contenir exactement 7 tirages', () => {
      expect(fam.sequence.length).toBe(7);
    });

    it('tous les tirages doivent être à 13:00', () => {
      for (const s of fam.sequence) {
        expect(s.time).toBe('13:00');
      }
    });

    it('doit contenir Fortune, Diamant et Prestige', () => {
      const names = fam.sequence.map(s => s.name);
      expect(names).toContain('Fortune');
      expect(names).toContain('Diamant');
      expect(names).toContain('Prestige');
    });
  });

  describe('Famille 3: Tirages de 19H55 exclusivement (Nocturne)', () => {
    const fam = INTER_DRAW_FAMILIES.FAMILY_19H55;

    it('doit contenir exactement 7 tirages', () => {
      expect(fam.sequence.length).toBe(7);
    });

    it('tous les tirages doivent être à 19:55', () => {
      for (const s of fam.sequence) {
        expect(s.time).toBe('19:55');
      }
    });

    it('doit inclure National, Friday Bonanza et Espoir', () => {
      const names = fam.sequence.map(s => s.name);
      expect(names).toContain('National');
      expect(names).toContain('Friday Bonanza');
      expect(names).toContain('Espoir');
    });
  });

  describe('Opérateurs Harmoniques Déterministes', () => {
    it('calcule correctement les miroirs décimaux dans [1, 90]', () => {
      expect(getMirrorNumber(7)).toBe(70);
      expect(getMirrorNumber(70)).toBe(7);
      expect(getMirrorNumber(23)).toBe(32);
      expect(getMirrorNumber(32)).toBe(23);
      expect(getMirrorNumber(44)).toBe(44); // palindrome
      // Miroir de 91 dépasserait 90, donc retourne 91
      expect(getMirrorNumber(19)).toBe(91 > 90 ? 19 : 91);
    });

    it('calcule correctement le complémentaire à 90 (somme = 91)', () => {
      expect(getComplement90(1)).toBe(90);
      expect(getComplement90(90)).toBe(1);
      expect(getComplement90(45)).toBe(46);
      expect(getComplement90(46)).toBe(45);
      expect(getComplement90(15)).toBe(76);
    });
  });

  describe('Moteur de Génération de Rapport Inter-Tirages', () => {
    it('génère un rapport valide pour un tirage de 13H (ex: Fortune)', async () => {
      const report = await generateInterDrawReport('Fortune', 'FAMILY_13H');
      expect(report).toBeDefined();
      expect(report?.family.id).toBe('FAMILY_13H');
      expect(report?.targetDraw).toBe('Fortune');
      expect(report?.topCandidates.length).toBeGreaterThan(0);
      expect(report?.recommendedPairs.length).toBeGreaterThan(0);
      expect(report?.carryOverRate).toBeGreaterThan(0);
      expect(report?.sourceTransitions).toBeDefined();
      expect(report?.sourceTransitions.length).toBe(5);
      expect(report?.sourceTransitions[0].transitions.length).toBeGreaterThan(0);
      expect(report?.fullCandidateScores).toBeDefined();
      expect(report?.fullCandidateScores.length).toBe(91);
      for (let i = 1; i <= 90; i++) {
        expect(report!.fullCandidateScores[i]).toBeGreaterThanOrEqual(0.01);
        expect(report!.fullCandidateScores[i]).toBeLessThanOrEqual(1.0);
      }
    });

    it('génère un rapport valide pour un tirage de 10H (ex: Reveil)', async () => {
      const report = await generateInterDrawReport('Reveil', 'FAMILY_10H_16H_SUN19H55');
      expect(report).toBeDefined();
      expect(report?.family.id).toBe('FAMILY_10H_16H_SUN19H55');
      expect(report?.targetDraw).toBe('Reveil');
      expect(report?.sourceTransitions.length).toBe(5);
    });
  });
});
