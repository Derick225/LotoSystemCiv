import { describe, it, expect } from 'vitest';
import {
  gapRangeSequenceService,
  GAP_RANGE_BINS,
  computeNormalizedWassersteinDistance,
  allocateHamiltonHareQuotas,
  GapBinId,
} from '../src/services/prediction/gapRangeSequenceService';
import { gapRangeSequencePlugin } from '../src/services/prediction/algorithms/gapRangeSequence';
import { DrawResult } from '../src/types';

function buildDeterministicHistory(totalDraws = 75, drawName = 'National'): DrawResult[] {
  const chronological: DrawResult[] = [];
  for (let i = 0; i < totalDraws; i++) {
    // Inject a strong recurring cadence for ball 17 and ball 42 every 5 draws (gap = 4 -> G4_7)
    // and immediate repeats (gap = 0 -> G0) for ball 8 on alternating draws
    const set = new Set<number>();
    if (i % 5 === 0) {
      set.add(17);
      set.add(42);
    }
    if (i % 3 === 0 || i % 3 === 1) {
      set.add(8);
    }

    let seed = i * 13 + 7;
    while (set.size < 5) {
      const candidate = (seed % 90) + 1;
      set.add(candidate);
      seed += 19;
    }

    const gagnants = Array.from(set).slice(0, 5);
    chronological.push({
      id: `draw-${i}`,
      drawName,
      draw_name: drawName,
      date: `${String((i % 28) + 1).padStart(2, '0')}/04/2025`,
      gagnants,
      machine: [11, 22, 33, 44, 55],
      version: 1,
    });
  }
  // History in app is stored newest first (index 0 = most recent)
  return chronological.reverse();
}

describe('Séquences & Patterns des Écarts par Tranches — Détection, Raisonnement & Sélection', () => {
  const binIds = GAP_RANGE_BINS.map((b) => b.id);

  it('respecte la topologie ordinale des tranches via la distance 1-Wasserstein (Earth-Mover)', () => {
    const empty = (): Record<GapBinId, number> => ({
      G0: 0,
      G1_3: 0,
      G4_7: 0,
      G8_14: 0,
      G15_24: 0,
      G25_39: 0,
      G40_PLUS: 0,
    });

    const allG0 = { ...empty(), G0: 5 };
    const allG1_3 = { ...empty(), G1_3: 5 };
    const allG8_14 = { ...empty(), G8_14: 5 };
    const allG40 = { ...empty(), G40_PLUS: 5 };

    const dNear = computeNormalizedWassersteinDistance(allG0, allG1_3, binIds);
    const dMid = computeNormalizedWassersteinDistance(allG0, allG8_14, binIds);
    const dFar = computeNormalizedWassersteinDistance(allG0, allG40, binIds);

    expect(dNear).toBeGreaterThan(0);
    expect(dNear).toBeLessThan(dMid);
    expect(dMid).toBeLessThan(dFar);
    expect(dFar).toBeCloseTo(1.0, 5);
  });

  it('alloue exactement 5 boules par la méthode proportionnelle de Hamilton-Hare sous contrainte de réservoir', () => {
    const probs: Record<GapBinId, number> = {
      G0: 0.08,
      G1_3: 0.24,
      G4_7: 0.28,
      G8_14: 0.22,
      G15_24: 0.10,
      G25_39: 0.05,
      G40_PLUS: 0.03,
    };
    const pools: Record<GapBinId, number> = {
      G0: 5,
      G1_3: 14,
      G4_7: 18,
      G8_14: 22,
      G15_24: 16,
      G25_39: 10,
      G40_PLUS: 5,
    };

    const quotas = allocateHamiltonHareQuotas(probs, pools, binIds, 5);
    const totalAllocated = Object.values(quotas).reduce((a, b) => a + b, 0);
    expect(totalAllocated).toBe(5);
    expect(quotas.G4_7).toBeGreaterThanOrEqual(1);
    expect(quotas.G1_3).toBeGreaterThanOrEqual(1);
  });

  it('calcule des poids bayésiens adaptatifs par gain d’information KL et différencie les boules au sein d’une même tranche', () => {
    const history = buildDeterministicHistory(80, 'National');
    const report = gapRangeSequenceService.analyzeGapRangeSequences('National', history);

    // 1. Le modèle nul H0 exact sur les 7 tranches somme à 1.0
    const sumH0 = report.bins.reduce((acc, b) => acc + b.theoreticalProb, 0);
    expect(sumH0).toBeCloseTo(1.0, 5);

    // 2. La distribution fusionnée somme à 1.0
    const sumBlended = report.binForecasts.reduce((acc, f) => acc + f.blendedProb, 0);
    expect(sumBlended).toBeCloseTo(1.0, 5);

    // 3. Les poids bayésiens (M0, M1, M2, Renouvellement, Écho W1) somment à 1.0
    const w = report.reasoning.modelWeights;
    const sumWeights =
      w.empiricalWeight +
      w.markov1Weight +
      w.markov2Weight +
      w.renewalWeight +
      w.seqEchoWeight;
    expect(sumWeights).toBeCloseTo(1.0, 5);
    expect(report.reasoning.klDivergenceMarkov1).toBeGreaterThanOrEqual(0);
    expect(report.reasoning.reasoningChain).toHaveLength(4);

    // 4. Différenciation intra-tranche : les boules d'une même tranche ont des micro-scores distincts
    const g4_7Candidates = report.selectionSynthesis.allCandidates.filter(
      (c) => c.binId === 'G4_7'
    );
    expect(g4_7Candidates.length).toBeGreaterThan(2);
    const distinctScores = new Set(g4_7Candidates.map((c) => c.compositeScore));
    expect(distinctScores.size).toBeGreaterThan(1);

    // 5. Synthèse de sélection optimale (5 boules + 2 réserves disjointes)
    const { optimalFive, reserveTwo, trancheQuotas } = report.selectionSynthesis;
    expect(optimalFive).toHaveLength(5);
    expect(new Set(optimalFive).size).toBe(5);
    expect(reserveTwo).toHaveLength(2);
    for (const r of reserveTwo) {
      expect(optimalFive).not.toContain(r);
    }

    const quotaSum = Object.values(trancheQuotas).reduce((a, b) => a + b, 0);
    expect(quotaSum).toBe(5);
  });

  it('est 100% déterministe et alimente le plugin algorithmique sans constantes arbitraires', () => {
    const history = buildDeterministicHistory(65, 'Fortune');
    const r1 = gapRangeSequenceService.analyzeGapRangeSequences('Fortune', history);
    const r2 = gapRangeSequenceService.analyzeGapRangeSequences('Fortune', history);

    expect(r1.selectionSynthesis.optimalFive).toEqual(r2.selectionSynthesis.optimalFive);
    expect(r1.selectionSynthesis.reserveTwo).toEqual(r2.selectionSynthesis.reserveTwo);
    expect(r1.reasoning.modelWeights).toEqual(r2.reasoning.modelWeights);

    const pluginOut = gapRangeSequencePlugin.execute({
      history,
      drawName: 'Fortune',
    });
    expect(Object.keys(pluginOut.scores)).toHaveLength(90);
    for (let n = 1; n <= 90; n++) {
      expect(pluginOut.scores[n]).toBeGreaterThanOrEqual(0);
      expect(pluginOut.scores[n]).toBeLessThanOrEqual(1);
    }
  });
});
