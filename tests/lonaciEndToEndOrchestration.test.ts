import { describe, it, expect, beforeAll } from 'vitest';
import {
  initializeLotoEngineWasm,
  isLotoEngineWasmReady,
  getHpcEngineMode
} from '../services/wasm/lotoEngineBridge';
import {
  buildPredictionRequestContext,
  runLocalPredictionPipeline
} from '../services/prediction/predictionOrchestrator';
import { DrawResult } from '../types';
import { INTER_DRAW_FAMILIES, getPrimaryInterDrawFamily } from '../constants';
import { globalCache } from '../services/cache/CacheService';

describe('Validation de Bout en Bout LONACI (10H, 13H, 16H, 19H55) & Recuit Simulé HPC', () => {
  beforeAll(async () => {
    const initialized = await initializeLotoEngineWasm();
    expect(initialized).toBe(true);
    expect(isLotoEngineWasmReady()).toBe(true);
  });

  const generateMockHistory = (drawName: string, count: number, baseSeed: number): DrawResult[] => {
    const history: DrawResult[] = [];
    for (let i = 0; i < count; i++) {
      const gagnants: number[] = [];
      const set = new Set<number>();
      let step = 0;
      while (set.size < 5) {
        step++;
        const num = (((baseSeed * 17 + i * 31 + step * 7) % 90) + 1);
        set.add(num);
      }
      gagnants.push(...Array.from(set));

      const machine: number[] = [];
      const mSet = new Set<number>();
      let mStep = 0;
      while (mSet.size < 5) {
        mStep++;
        const num = (((baseSeed * 23 + i * 19 + mStep * 11) % 90) + 1);
        mSet.add(num);
      }
      machine.push(...Array.from(mSet));

      const dateStr = new Date(Date.UTC(2026, 8, 1 + i, 10, 0, 0)).toISOString();
      history.push({
        id: `${drawName}_${i}`,
        drawName,
        draw_name: drawName,
        date: dateStr,
        gagnants,
        machine
      });
    }
    return history;
  };

  const lonaciDrawConfigs = [
    {
      slot: '10:00 (10H)',
      drawName: 'Reveil',
      expectedFamily: 'quotidien',
      seed: 101,
    },
    {
      slot: '13:00 (13H)',
      drawName: 'Etoile',
      expectedFamily: 'quotidien',
      seed: 131,
    },
    {
      slot: '16:00 (16H)',
      drawName: 'Akwaba',
      expectedFamily: 'quotidien',
      seed: 161,
    },
    {
      slot: '19:55 (19H55)',
      drawName: 'Monday Special',
      expectedFamily: 'hebdomadaire',
      seed: 195,
    },
  ];

  describe('1. Inférence Complète E2E pour Chaque Tirage Réel LONACI', () => {
    lonaciDrawConfigs.forEach(({ slot, drawName, expectedFamily, seed }) => {
      it(`doit exécuter le pipeline d'inférence avec succès sur ${slot} - ${drawName}`, async () => {
        const history = generateMockHistory(drawName, 18, seed);
        const context = buildPredictionRequestContext(
          drawName,
          history,
          15,
          undefined,
          undefined,
          undefined,
          true // skipTraining pour vitesse unitaire
        );

        const prediction = await runLocalPredictionPipeline(context);

        // 1. Structure de la combinaison principale (suggestedNumbers)
        expect(prediction).toBeDefined();
        expect(prediction.drawName).toBe(drawName);
        expect(prediction.suggestedNumbers).toHaveLength(5);
        expect(new Set(prediction.suggestedNumbers).size).toBe(5);

        prediction.suggestedNumbers.forEach((n) => {
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(90);
        });

        // 2. Vérification des scores et de la décomposition ScoreBreakdown
        expect(prediction.breakdown).toBeDefined();
        const breakdownKeys = Object.keys(prediction.breakdown);
        expect(breakdownKeys.length).toBeGreaterThanOrEqual(5);

        // 3. Vérification de la famille fermée associée
        const detectedFamily = getPrimaryInterDrawFamily(drawName);
        expect(detectedFamily.id).toBe(expectedFamily);
      });
    });
  });

  describe('2. Reproductibilité Déterministe et Non-Régression', () => {
    it('doit produire 100% exactement la même combinaison lors de deux exécutions consécutives', async () => {
      const history = generateMockHistory('Reveil', 16, 42);
      
      const ctx1 = buildPredictionRequestContext('Reveil', history, 14, undefined, undefined, undefined, true);
      const pred1 = await runLocalPredictionPipeline(ctx1);

      const ctx2 = buildPredictionRequestContext('Reveil', history, 14, undefined, undefined, undefined, true);
      const pred2 = await runLocalPredictionPipeline(ctx2);

      expect(pred1.suggestedNumbers).toEqual(pred2.suggestedNumbers);
      expect(pred1.candidates).toEqual(pred2.candidates);
      expect(pred1.confidence).toBeCloseTo(pred2.confidence, 4);
    });
  });

  describe('3. Étanchéité Stricte des 2 Réseaux Inter-Tirages (AGENTS.md)', () => {
    it('doit garantir que les clés de cache et relations respectent les cloisons hermétiques', () => {
      const keyNational10H = globalCache.getInterDrawKey(
        'quotidien',
        'Reveil',
        'hawkes'
      );
      const keyNational16H = globalCache.getInterDrawKey(
        'quotidien',
        'Akwaba',
        'hawkes'
      );
      const keyZenith = globalCache.getInterDrawKey(
        'quotidien',
        'Etoile',
        'hawkes'
      );
      const keyNocturne = globalCache.getInterDrawKey(
        'hebdomadaire',
        'Monday Special',
        'hawkes'
      );

      // Quotidien regroupe 10H, 13H et 16H
      expect(keyNational10H).toContain('quotidien');
      expect(keyNational16H).toContain('quotidien');
      expect(keyZenith).toContain('quotidien');

      // Hebdomadaire est dans un réseau étanche distinct
      expect(keyNocturne).toContain('hebdomadaire');

      // Zéro collision
      expect(keyNational10H).not.toEqual(keyNocturne);
      expect(keyZenith).not.toEqual(keyNocturne);
    });
  });
});
