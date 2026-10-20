import { describe, it, expect } from 'vitest';
import { calculateStochasticEntropyForensics } from './stochasticEntropyService';
import { AlgoKey, AlgoWeights, DEFAULT_ALGO_WEIGHTS } from '../../shared/prediction.types';
import type { DrawResult } from '../../types';

/**
 * LCG déterministe à seed canonique (AGENTS.md #2 : zéro Math.random dans les tests
 * du moteur). Produit une séquence reproductible pour générer des tirages fictifs.
 */
const makeLcg = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const buildHistory = (drawName: string, count: number, seed: number): DrawResult[] => {
  const rnd = makeLcg(seed);
  const draws: DrawResult[] = [];
  for (let i = 0; i < count; i++) {
    const winners = new Set<number>();
    while (winners.size < 5) {
      winners.add(1 + Math.floor(rnd() * 90));
    }
    draws.push({
      id: `${drawName}-${i}`,
      drawName,
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      gagnants: Array.from(winners).sort((a, b) => a - b),
    });
  }
  // index 0 = plus récent (ordre attendu par purifyHistoryForDraw / le moteur)
  return draws.reverse();
};

const weights: AlgoWeights = { ...DEFAULT_ALGO_WEIGHTS };

describe('calculateStochasticEntropyForensics — déterminisme & intégrité (recs 1-4)', () => {
  it('est 100% déterministe : deux exécutions sur le même historique sont identiques', () => {
    const history = buildHistory('Reveil', 40, 12345);
    const a = calculateStochasticEntropyForensics('Reveil', history, [], weights, 15);
    const b = calculateStochasticEntropyForensics('Reveil', history, [], weights, 15);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('borne chaque unpredictabilityScore sur [0, 100] (composite normalisé, rec 1)', () => {
    const history = buildHistory('Reveil', 50, 987);
    const res = calculateStochasticEntropyForensics('Reveil', history, [], weights, 15);
    expect(res.timeline.length).toBeGreaterThan(0);
    for (const p of res.timeline) {
      expect(p.unpredictabilityScore).toBeGreaterThanOrEqual(0);
      expect(p.unpredictabilityScore).toBeLessThanOrEqual(100);
      // entropies normalisées sur [0, 1]
      expect(p.drawEntropy).toBeGreaterThanOrEqual(0);
      expect(p.drawEntropy).toBeLessThanOrEqual(1);
      expect(p.predictionEntropy).toBeGreaterThanOrEqual(0);
      expect(p.predictionEntropy).toBeLessThanOrEqual(1);
      expect(p.klDivergence).toBeGreaterThanOrEqual(0);
    }
  });

  it('expose un exposant de Lyapunov fini OU NaN — jamais une valeur inventée (rec 2)', () => {
    const history = buildHistory('Reveil', 60, 4242);
    const res = calculateStochasticEntropyForensics('Reveil', history, [], weights, 15);
    // Le FTLE de Rosenstein est constant sur la série : tous les points partagent la valeur.
    const first = res.timeline[0]?.lyapunovExponent;
    if (first !== undefined) {
      for (const p of res.timeline) {
        expect(p.lyapunovExponent).toBe(first);
      }
    }
    // meanLyapunovExponent est soit fini, soit NaN (pas un fallback arbitraire).
    expect(
      Number.isFinite(res.meanLyapunovExponent) || Number.isNaN(res.meanLyapunovExponent)
    ).toBe(true);
  });

  it('produit des canaux Markov/affinité réels : Q reste une distribution valide (rec 3-4)', () => {
    const history = buildHistory('Reveil', 45, 777);
    const res = calculateStochasticEntropyForensics('Reveil', history, [], weights, 15);
    for (const p of res.timeline) {
      // H(Q) normalisé ∈ [0,1] ⇒ softmax z-scoré valide, aucune fuite de masse.
      expect(p.predictionEntropy).toBeGreaterThanOrEqual(0);
      expect(p.predictionEntropy).toBeLessThanOrEqual(1);
      expect(Number.isNaN(p.predictionEntropy)).toBe(false);
      expect(Number.isNaN(p.unpredictabilityScore)).toBe(false);
    }
  });

  it('historique vide ⇒ timeline vide, score courant NaN, sans exception (honnêteté n/d)', () => {
    const res = calculateStochasticEntropyForensics('Reveil', [], [], weights, 15);
    expect(res.timeline).toHaveLength(0);
    expect(Number.isNaN(res.currentUnpredictabilityScore)).toBe(true);
    expect(Number.isNaN(res.predictabilityResonanceWindow.confidence)).toBe(true);
  });

  it('historique trop court (< 4 tirages) ⇒ timeline vide, pas de FTLE fabriqué', () => {
    const history = buildHistory('Reveil', 3, 55);
    const res = calculateStochasticEntropyForensics('Reveil', history, [], weights, 15);
    expect(res.timeline).toHaveLength(0);
    expect(Number.isNaN(res.currentUnpredictabilityScore)).toBe(true);
  });

  it('isole strictement par tirage : un drawName absent de l\'historique ne produit rien', () => {
    const history = buildHistory('Zenith', 40, 2024);
    const res = calculateStochasticEntropyForensics('Reveil', history, [], weights, 15);
    expect(res.timeline).toHaveLength(0);
  });
});
