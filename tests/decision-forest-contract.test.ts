import { describe, it, expect, beforeAll } from 'vitest';
import {
  runDecisionForest,
  calculateFeatureImportance,
  buildTreeDecisionPath,
  FEATURES_LABELS,
} from '../src/services/decisionTreeService';
import { generateDeterministicFallbackHistory } from '../src/services/lotteryService';
import type { DrawResult, ForestVote } from '../src/types';

describe('CONTRAT DU MODULE ARBRES DE DÉCISION & FORÊTS (AGENTS.md)', () => {
  const fullHistory: DrawResult[] = generateDeterministicFallbackHistory('Fortune').slice(0, 42);
  let cachedRun: {
    votes: ForestVote[];
    dataset: { features: number[]; class: number; weight: number }[];
    diagnostics?: any;
    dnaSieveInfo?: any;
  };

  beforeAll(async () => {
    cachedRun = await runDecisionForest(fullHistory, 'consensus', FEATURES_LABELS, 'Fortune');
  });

  it('exporte exactement 10 features canoniques dont les extensions stochastiques', () => {
    expect(FEATURES_LABELS.length).toBe(10);
    expect(FEATURES_LABELS).toContain('Critical Gap');
    expect(FEATURES_LABELS).toContain('Frequency');
    expect(FEATURES_LABELS).toContain('Shadow');
    expect(FEATURES_LABELS).toContain('Consensus Trap');
    expect(FEATURES_LABELS).toContain('Neighbor');
    expect(FEATURES_LABELS).toContain('Machine Leak');
    expect(FEATURES_LABELS).toContain('Norm Gap');
    expect(FEATURES_LABELS).toContain('Harmonic Resonance');
    expect(FEATURES_LABELS).toContain('Inter-Draw Flux');
    expect(FEATURES_LABELS).toContain('Spectral Memory');
  });

  it('gère de manière robuste et sans exception un historique insuffisant (< 40)', async () => {
    const shortHistory = fullHistory.slice(0, 20);
    const result = await runDecisionForest(shortHistory, 'consensus', FEATURES_LABELS, 'Fortune');
    expect(result.votes).toEqual([]);
    expect(result.dataset).toEqual([]);
  });

  it('exécute la forêt floue (Fuzzy Random Forest) et produit les 20 candidats d élite calibrés', () => {
    expect(cachedRun.votes.length).toBe(20);
    expect(cachedRun.dataset.length).toBeGreaterThan(0);
    expect(cachedRun.diagnostics).toBeDefined();

    // 20 candidats distincts sur l'intervalle [1, 90]
    const numbersSet = new Set(cachedRun.votes.map(v => v.candidate));
    expect(numbersSet.size).toBe(20);
    cachedRun.votes.forEach(vote => {
      expect(vote.candidate).toBeGreaterThanOrEqual(1);
      expect(vote.candidate).toBeLessThanOrEqual(90);
    });

    // Tous les scores sont bornés et valides
    cachedRun.votes.forEach(vote => {
      expect(vote.score).toBeGreaterThanOrEqual(0.0);
      expect(vote.score).toBeLessThanOrEqual(100.0);
      expect(Number.isFinite(vote.score)).toBe(true);
    });
    expect(cachedRun.votes[0].score).toBeGreaterThan(0);
  });

  it('garantit un déterminisme absolu (100% reproductible à historique identique)', async () => {
    const run2 = await runDecisionForest(fullHistory, 'consensus', FEATURES_LABELS, 'Fortune');

    expect(cachedRun.votes.length).toBe(run2.votes.length);
    for (let i = 0; i < cachedRun.votes.length; i++) {
      expect(cachedRun.votes[i].candidate).toBe(run2.votes[i].candidate);
      expect(Math.abs(cachedRun.votes[i].score - run2.votes[i].score)).toBeLessThan(1e-5);
    }
  });

  it('supporte le mode de filtrage Shadow basé sur la distance de Mahalanobis', async () => {
    const resShadow = await runDecisionForest(fullHistory, 'shadow', FEATURES_LABELS, 'Fortune');
    expect(resShadow.votes.length).toBe(20);
    expect(resShadow.votes[0].score).toBeGreaterThan(0);
    expect(resShadow.votes.every(v => v.candidate >= 1 && v.candidate <= 90)).toBe(true);
  });

  it('calcule correctement l importance relative des features (MDI / Pearson)', () => {
    const importance = calculateFeatureImportance(cachedRun.dataset, FEATURES_LABELS);

    expect(importance).toBeDefined();
    const values = Object.values(importance);
    expect(values.length).toBe(FEATURES_LABELS.length);

    // Au moins une feature culmine à 1.0 (normalisation relative)
    const maxVal = Math.max(...values);
    expect(maxVal).toBeCloseTo(1.0, 4);

    values.forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0.0);
      expect(v).toBeLessThanOrEqual(1.0);
    });
  });

  it('reconstruit le chemin de décision primaire explicable (Decision Path)', () => {
    const bestCand = cachedRun.votes[0];
    expect(bestCand.decisionPath).toBeDefined();
    const path = buildTreeDecisionPath(bestCand.decisionPath, bestCand.features.values || [], FEATURES_LABELS);

    expect(path).toBeDefined();
    expect(path.type).toBeDefined();
    expect(path.label).toBeDefined();
  });
});
