import { describe, it, expect, beforeAll } from 'vitest';
import { interDrawResonancePlugin } from '../services/prediction/algorithms/interDrawResonance';
import { interMonthlyResonancePlugin } from '../services/prediction/algorithms/interMonthlyResonance';
import { algorithmRegistry } from '../services/prediction/algorithmRegistry';
import { initCoreAlgorithms } from '../services/prediction/algorithms';
import { AlgoKey } from '../shared/prediction.types';
import { DrawResult } from '../types';

describe('VÉRIFICATION EXPERTE DES ALGORITHMES DE RÉSONANCE', () => {
  beforeAll(() => {
    initCoreAlgorithms();
  });
  // Historique synthétique réaliste 5/90 sur plusieurs mois
  const mockHistory: DrawResult[] = [
    {
      id: 'd1',
      date: '15/03/2026',
      tirage: 'Fortune',
      drawName: 'Fortune',
      gagnants: [12, 23, 34, 45, 56],
      machine: [1, 2, 3, 4, 5]
    },
    {
      id: 'd2',
      date: '08/03/2026',
      tirage: 'Fortune',
      drawName: 'Fortune',
      gagnants: [10, 20, 30, 40, 50],
      machine: [6, 7, 8, 9, 11]
    },
    {
      id: 'd3',
      date: '15/02/2026',
      tirage: 'Fortune',
      drawName: 'Fortune',
      gagnants: [12, 25, 32, 45, 78], // Jumeau mensuel M-1 (même jour 15)
      machine: [15, 16, 17, 18, 19]
    },
    {
      id: 'd4',
      date: '15/01/2026',
      tirage: 'Fortune',
      drawName: 'Fortune',
      gagnants: [12, 23, 67, 80, 89], // Jumeau mensuel M-2 (même jour 15)
      machine: [21, 22, 24, 26, 27]
    },
    {
      id: 'd5',
      date: '15/03/2025',
      tirage: 'Fortune',
      drawName: 'Fortune',
      gagnants: [12, 34, 46, 56, 79], // Jumeau annuel Y-1 (même quinzaine mars)
      machine: [31, 32, 33, 35, 36]
    },
    // Remplissage avec des tirages réguliers pour atteindre une profondeur d'analyse adéquate
    ...Array.from({ length: 25 }, (_, i) => ({
      id: `d_extra_${i}`,
      date: `01/0${(i % 9) + 1}/2025`,
      tirage: 'Fortune',
      drawName: 'Fortune',
      gagnants: [
        ((i * 3) % 90) + 1,
        ((i * 7) % 90) + 1,
        ((i * 11) % 90) + 1,
        ((i * 13) % 90) + 1,
        ((i * 17) % 90) + 1
      ],
      machine: [
        ((i * 5) % 90) + 1,
        ((i * 9) % 90) + 1,
        ((i * 15) % 90) + 1,
        ((i * 19) % 90) + 1,
        ((i * 23) % 90) + 1
      ]
    }))
  ];

  const baseContext = {
    drawName: 'Fortune',
    history: mockHistory,
    pluginCache: {},
    weights: { [AlgoKey.INTER_DRAW_RESONANCE]: 1.0, [AlgoKey.INTER_MONTHLY_RESONANCE]: 1.0 },
    statisticalBounds: { hurstExponent: 0.58 }
  };

  describe('1. Algorithme inter_draw_resonance (Résonance Inter-Tirages)', () => {
    it('est conforme aux règles du registre et strictement déterministe', () => {
      expect(interDrawResonancePlugin.key).toBe(AlgoKey.INTER_DRAW_RESONANCE);
      expect(interDrawResonancePlugin.isStrictlyDeterministic).toBe(true);
      expect(interDrawResonancePlugin.category).toBe('core');
      expect(interDrawResonancePlugin.stability).toBe('stable');
    });

    it('génère des scores continus [0, 100] et des confidences [0, 1] sur les 90 numéros', () => {
      const ctx = { ...baseContext, pluginCache: {} };
      interDrawResonancePlugin.precompute(ctx);

      for (let n = 1; n <= 90; n++) {
        const res = interDrawResonancePlugin.evaluate(n, ctx);
        expect(res.score).toBeGreaterThanOrEqual(0);
        expect(res.score).toBeLessThanOrEqual(100);
        expect(Number.isFinite(res.score)).toBe(true);
        expect(res.confidence).toBeGreaterThanOrEqual(0);
        expect(res.confidence).toBeLessThanOrEqual(1);
        expect(res.metadata).toBeDefined();
        expect(res.metadata.familyId).toBe('FAMILY_13H');
      }
    });

    it('respecte le déterminisme absolu (100% reproductible)', () => {
      const ctx1 = { ...baseContext, pluginCache: {} };
      const ctx2 = { ...baseContext, pluginCache: {} };

      interDrawResonancePlugin.precompute(ctx1);
      interDrawResonancePlugin.precompute(ctx2);

      for (let n = 1; n <= 90; n++) {
        const r1 = interDrawResonancePlugin.evaluate(n, ctx1);
        const r2 = interDrawResonancePlugin.evaluate(n, ctx2);
        expect(r1.score).toBe(r2.score);
        expect(r1.confidence).toBe(r2.confidence);
      }
    });

    it('décompose le signal en 4 canaux continus et attribue les drapeaux harmoniques', () => {
      const ctx = { ...baseContext, pluginCache: {} };
      interDrawResonancePlugin.precompute(ctx);

      // On vérifie qu'au moins un numéro possède des métadonnées de canal
      let foundTransition = false;
      let foundCarryOver = false;

      for (let n = 1; n <= 90; n++) {
        const res = interDrawResonancePlugin.evaluate(n, ctx);
        if (res.metadata.transitionScore > 0) foundTransition = true;
        if (res.metadata.flags?.includes('REPORT_DIRECT')) foundCarryOver = true;
      }

      expect(foundTransition).toBe(true);
      expect(foundCarryOver).toBe(true);
    });

    it('gère élégamment les tirages non reliés ou hors famille (scores neutres 50.0)', () => {
      const ctx = { ...baseContext, drawName: 'all', pluginCache: {} };
      interDrawResonancePlugin.precompute(ctx);

      const res = interDrawResonancePlugin.evaluate(7, ctx);
      expect(res.score).toBe(50.0);
      expect(res.confidence).toBe(0.5);
      expect(res.metadata.familyId).toBe('NONE');
    });
  });

  describe('2. Algorithme inter_monthly_resonance (Résonance Inter-Mensuelle)', () => {
    it('est conforme aux règles du registre et strictement déterministe', () => {
      expect(interMonthlyResonancePlugin.key).toBe(AlgoKey.INTER_MONTHLY_RESONANCE);
      expect(interMonthlyResonancePlugin.isStrictlyDeterministic).toBe(true);
      expect(interMonthlyResonancePlugin.category).toBe('advanced');
      expect(interMonthlyResonancePlugin.stability).toBe('stable');
    });

    it('détecte les jumeaux temporels multi-échelles (mensuels et annuels) et applique le tamis ADN', () => {
      const ctx = { ...baseContext, pluginCache: {} };
      interMonthlyResonancePlugin.precompute(ctx);

      let signalDetected = false;
      let dnaSieveActive = false;

      for (let n = 1; n <= 90; n++) {
        const res = interMonthlyResonancePlugin.evaluate(n, ctx);
        expect(res.score).toBeGreaterThanOrEqual(0);
        expect(res.score).toBeLessThanOrEqual(100);
        expect(Number.isFinite(res.score)).toBe(true);
        expect(res.confidence).toBeGreaterThanOrEqual(0.2);
        expect(res.confidence).toBeLessThanOrEqual(1.0);

        if (res.metadata.signalDetected) signalDetected = true;
        if (res.metadata.dnaSieveActive) dnaSieveActive = true;
      }

      expect(signalDetected).toBe(true);
      expect(dnaSieveActive).toBe(true);
    });

    it('calcule des composantes mensuelles et annuelles distinctes dans les métadonnées', () => {
      const ctx = { ...baseContext, pluginCache: {} };
      interMonthlyResonancePlugin.precompute(ctx);

      const res12 = interMonthlyResonancePlugin.evaluate(12, ctx);
      expect(res12.metadata).toBeDefined();
      expect(typeof res12.metadata.monthlyVal).toBe('number');
      expect(typeof res12.metadata.annualVal).toBe('number');
      expect(typeof res12.metadata.dnaMultiplier).toBe('number');
      expect(typeof res12.metadata.dnaAffinity).toBe('number');
      expect(res12.metadata.topTwinDate).not.toBe('N/A');
    });

    it('respecte le déterminisme absolu (100% reproductible)', () => {
      const ctx1 = { ...baseContext, pluginCache: {} };
      const ctx2 = { ...baseContext, pluginCache: {} };

      interMonthlyResonancePlugin.precompute(ctx1);
      interMonthlyResonancePlugin.precompute(ctx2);

      for (let n = 1; n <= 90; n++) {
        const r1 = interMonthlyResonancePlugin.evaluate(n, ctx1);
        const r2 = interMonthlyResonancePlugin.evaluate(n, ctx2);
        expect(r1.score).toBe(r2.score);
        expect(r1.confidence).toBe(r2.confidence);
      }
    });
  });

  describe('3. Intégration globale dans AlgorithmRegistry', () => {
    it('vérifie que les deux algorithmes sont enregistrés et actifs', () => {
      const drawPlugin = algorithmRegistry.find(p => p.key === AlgoKey.INTER_DRAW_RESONANCE);
      const monthlyPlugin = algorithmRegistry.find(p => p.key === AlgoKey.INTER_MONTHLY_RESONANCE);

      expect(drawPlugin).toBeDefined();
      expect(monthlyPlugin).toBeDefined();
      expect(drawPlugin?.isStrictlyDeterministic).toBe(true);
      expect(monthlyPlugin?.isStrictlyDeterministic).toBe(true);
    });
  });
});
