import { describe, it, expect } from 'vitest';
import {
  computeChannelAttribution,
  ChannelAttributionInput,
} from './channelAttributionService';

const makeScores = (fn: (n: number) => number): Float32Array => {
  const arr = new Float32Array(91);
  for (let n = 1; n <= 90; n++) arr[n] = fn(n);
  return arr;
};

const uniformScores = (v: number) => makeScores(() => v);
const spikeScores = (spike: number, value = 1.0) =>
  makeScores((n) => (n === spike ? value : 0));

const baseInput = (
  overrides: Partial<ChannelAttributionInput>
): ChannelAttributionInput => ({
  channelKeys: ['frequency', 'gap'],
  algoScores: { frequency: uniformScores(0.5), gap: uniformScores(0.5) },
  weights: { frequency: 0.7, gap: 0.3 },
  actualWinners: [1, 2, 3, 4, 5],
  top5Predicted: [1, 2, 3, 4, 5],
  labels: { frequency: 'Fréquence', gap: 'Écart' },
  ...overrides,
});

describe('Attribution Causale de Canaux — Contrefactuel Continu', () => {
  it('est strictement déterministe : entrées identiques → sorties identiques bit pour bit', () => {
    const input = baseInput({});
    const run1 = computeChannelAttribution(input);
    const run2 = computeChannelAttribution(JSON.parse(JSON.stringify(input)));
    expect(JSON.stringify(run1)).toEqual(JSON.stringify(run2));
  });

  it('partage additif exact : les parts des canaux sur le Top-5 somment à 1', () => {
    const input = baseInput({
      algoScores: {
        frequency: makeScores((n) => (n <= 5 ? 1.0 : 0)),
        gap: makeScores((n) => (n <= 5 ? 0.5 : 0)),
      },
    });
    const impacts = computeChannelAttribution(input);
    const freq = impacts.find((i) => i.key === 'frequency')!;
    const gap = impacts.find((i) => i.key === 'gap')!;
    // Contribution freq = 5 × 0.7 × 1.0 = 3.5 ; gap = 5 × 0.3 × 0.5 = 0.75 ; total = 4.25
    expect(freq.additiveShareTop5).toBeCloseTo(3.5 / 4.25, 6);
    expect(gap.additiveShareTop5).toBeCloseTo(0.75 / 4.25, 6);
    expect(freq.additiveShareTop5 + gap.additiveShareTop5).toBeCloseTo(1.0, 6);
  });

  it('attribution causale : un canal unique responsable d\'un hit voit Δhits = +N sous ablation', () => {
    const input = baseInput({
      channelKeys: ['frequency', 'noise'],
      algoScores: {
        frequency: makeScores((n) => (n % 10 === 0 && n <= 50 ? 1.0 : 0)),
        noise: uniformScores(0.01),
      },
      weights: { frequency: 0.6, noise: 0.4 },
      actualWinners: [10, 20, 30, 40, 50],
      top5Predicted: [10, 20, 30, 40, 50],
    });
    const impacts = computeChannelAttribution(input);
    const freq = impacts.find((i) => i.key === 'frequency')!;
    const noise = impacts.find((i) => i.key === 'noise')!;

    expect(freq.deltaHitsTop5Ablation).toBe(5);
    expect(noise.deltaHitsTop5Ablation).toBe(0);
    // Le bruit dilue les probabilités : son ablation réduit le Brier → Δ négatif
    expect(noise.deltaBrierAblation).toBeLessThan(0);
    // Score d'importance normalisé sur le simplexe
    const sumImportance = impacts.reduce((a, i) => a + i.causalImportanceScore, 0);
    expect(sumImportance).toBeCloseTo(1.0, 9);
    expect(impacts[0].key).toBe('frequency');
    expect(impacts[0].causalRank).toBe(1);
  });

  it('distingue attribution descriptive et causale : canaux redondants à Δhits nul malgré 50% de part additive', () => {
    const input = baseInput({
      channelKeys: ['clone_a', 'clone_b', 'context'],
      algoScores: {
        clone_a: spikeScores(7),
        clone_b: spikeScores(7),
        context: uniformScores(0.01),
      },
      weights: { clone_a: 0.25, clone_b: 0.25, context: 0.5 },
      actualWinners: [7, 13, 14, 15, 16],
      top5Predicted: [7, 1, 2, 3, 4],
    });
    const impacts = computeChannelAttribution(input);
    const a = impacts.find((i) => i.key === 'clone_a')!;
    const b = impacts.find((i) => i.key === 'clone_b')!;

    // Part additive exacte = 0.25 / (0.25 + 0.25 + 5 × 0.005) = 0.25 / 0.525 ≈ 0.4762
    expect(a.additiveShareWinners).toBeGreaterThan(0.47);
    expect(b.additiveShareWinners).toBeGreaterThan(0.47);
    // Mais chaque clone est intégralement remplacé par l'autre : zéro hit causal perdu
    expect(a.deltaHitsTop5Ablation).toBe(0);
    expect(b.deltaHitsTop5Ablation).toBe(0);
  });

  it('canal à poids nul : deltas exactement nuls (mathématique d\'ablation, non une porte)', () => {
    const input = baseInput({
      channelKeys: ['frequency', 'gap'],
      weights: { frequency: 1.0, gap: 0.0 },
    });
    const gap = computeChannelAttribution(input).find((i) => i.key === 'gap')!;
    expect(gap.deltaHitsTop5Ablation).toBe(0);
    expect(gap.deltaBrierAblation).toBe(0);
    expect(gap.deltaCrossEntropyAblation).toBe(0);
    expect(gap.deltaCalibrationAblation).toBe(0);
    expect(gap.deltaHitsTop5Reallocation).toBe(0);
    expect(gap.deltaBrierReallocation).toBe(0);
  });

  it('ensemble dégénéré (scores tous nuls) : repli uniforme exact, aucun NaN', () => {
    const input = baseInput({
      algoScores: { frequency: uniformScores(0), gap: uniformScores(0) },
    });
    const impacts = computeChannelAttribution(input);
    expect(impacts.length).toBe(2);
    for (const i of impacts) {
      expect(Number.isFinite(i.deltaBrierAblation)).toBe(true);
      expect(Number.isFinite(i.causalImportanceScore)).toBe(true);
    }
    // Brier uniforme exact (K/90)(1-K/90) → calibration = 100·e^(−ln2) = 50
    const freq = impacts.find((i) => i.key === 'frequency')!;
    expect(freq.deltaCalibrationAblation).toBeCloseTo(0, 5);
  });

  it('continuité C⁰ : une perturbation infime du poids ne produit aucun saut de Δ', () => {
    const scores = {
      frequency: makeScores((n) => (n <= 10 ? 1.0 - n * 0.05 : 0.01)),
      gap: makeScores((n) => (n > 80 ? 0.9 : 0.02)),
    };
    const ref = computeChannelAttribution(
      baseInput({
        algoScores: scores,
        weights: { frequency: 0.5, gap: 0.5 },
        actualWinners: [3, 9, 84, 87, 90],
      })
    );
    const perturbed = computeChannelAttribution(
      baseInput({
        algoScores: scores,
        weights: { frequency: 0.5 + 1e-6, gap: 0.5 - 1e-6 },
        actualWinners: [3, 9, 84, 87, 90],
      })
    );
    for (let idx = 0; idx < ref.length; idx++) {
      expect(Math.abs(ref[idx].deltaBrierAblation - perturbed[idx].deltaBrierAblation)).toBeLessThan(1e-3);
      expect(ref[idx].deltaHitsTop5Ablation).toBe(perturbed[idx].deltaHitsTop5Ablation);
    }
  });

  it('importance causale uniforme quand tous les Δ sont identiques (symétrie du softmax)', () => {
    const input = baseInput({
      algoScores: { frequency: uniformScores(0.4), gap: uniformScores(0.6) },
    });
    const impacts = computeChannelAttribution(input);
    // Scores uniformes → tous les contrefactuels équivalents à l'originel → Δ identiques
    expect(impacts[0].causalImportanceScore).toBeCloseTo(impacts[1].causalImportanceScore, 9);
  });
});
