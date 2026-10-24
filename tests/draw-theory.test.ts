import { describe, it, expect } from 'vitest';
import {
  DRAW_DOMAIN_SIZE,
  DRAW_PICK_SIZE,
  EXACT_SUM_MOMENTS,
  EXACT_AMPLITUDE_MOMENTS,
  EXACT_CONSECUTIVE_MOMENTS,
  EXACT_AC_MOMENTS,
  EXACT_AC_DISTRIBUTION,
  EXACT_COMBINATION_COUNT,
  UNIFORM_SINGLE_NUMBER_PROBABILITY,
  UNIFORM_BRIER_REFERENCE,
  UNIFORM_EXPECTED_HITS_TOP_K,
} from '../src/shared/drawTheory';
import { FALLBACK_CALIBRATION } from '../src/shared/prediction.types';
import { generateEmpiricalCalibration } from '../src/services/prediction/ticketAnalysisService';
import { calculateACValue } from '../src/services/mathCore';
import type { DrawResult } from '../src/types';

const choose = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return result;
};

const enumerateCombinations = (n: number, k: number): number[][] => {
  const out: number[][] = [];
  const current: number[] = [];
  const recurse = (start: number) => {
    if (current.length === k) {
      out.push([...current]);
      return;
    }
    for (let v = start; v <= n - (k - current.length) + 1; v++) {
      current.push(v);
      recurse(v + 1);
      current.pop();
    }
  };
  recurse(1);
  return out;
};

const meanAndVariance = (values: number[]) => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return { mean, variance };
};

const genericClosedForms = (n: number, k: number) => {
  const sumMean = (k * (n + 1)) / 2;
  const sumVariance = ((k * (n * n - 1)) / 12) * ((n - k) / (n - 1));

  const amplitudeMean = ((k - 1) / (k + 1)) * (n + 1);
  const amplitudeVariance =
    (2 * (k - 1) * (n + 1) * (n - k)) / (Math.pow(k + 1, 2) * (k + 2));

  const consecutiveMean = (k * (k - 1)) / n;
  const adjacentWindows = n - 1;
  const overlappingPairs = n - 2;
  const disjointPairs = (adjacentWindows * (adjacentWindows - 1)) / 2 - overlappingPairs;
  const overlapProb =
    (k * (k - 1) * (k - 2)) / (n * (n - 1) * (n - 2));
  const disjointProb =
    (k * (k - 1) * (k - 2) * (k - 3)) / (n * (n - 1) * (n - 2) * (n - 3));
  const consecutiveSecondMoment =
    consecutiveMean +
    2 * (overlappingPairs * overlapProb + disjointPairs * disjointProb);
  const consecutiveVariance = consecutiveSecondMoment - consecutiveMean * consecutiveMean;

  return {
    sumMean,
    sumVariance,
    amplitudeMean,
    amplitudeVariance,
    consecutiveMean,
    consecutiveVariance,
  };
};

describe('drawTheory — moments exacts du tirage 5/90', () => {
  it('valide les formes fermées par énumération exhaustive sur un domaine réduit', () => {
    const n = 12;
    const k = 4;
    const combos = enumerateCombinations(n, k);
    expect(combos.length).toBe(choose(n, k));

    const sums: number[] = [];
    const amplitudes: number[] = [];
    const consecutives: number[] = [];

    for (const combo of combos) {
      const sorted = [...combo].sort((a, b) => a - b);
      sums.push(sorted.reduce((a, b) => a + b, 0));
      amplitudes.push(sorted[sorted.length - 1] - sorted[0]);
      let c = 0;
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i + 1] - sorted[i] === 1) c++;
      }
      consecutives.push(c);
    }

    const sum = meanAndVariance(sums);
    const amplitude = meanAndVariance(amplitudes);
    const consecutive = meanAndVariance(consecutives);
    const closed = genericClosedForms(n, k);

    expect(sum.mean).toBeCloseTo(closed.sumMean, 12);
    expect(sum.variance).toBeCloseTo(closed.sumVariance, 12);
    expect(amplitude.mean).toBeCloseTo(closed.amplitudeMean, 12);
    expect(amplitude.variance).toBeCloseTo(closed.amplitudeVariance, 12);
    expect(consecutive.mean).toBeCloseTo(closed.consecutiveMean, 12);
    expect(consecutive.variance).toBeCloseTo(closed.consecutiveVariance, 12);
  });

  it('expose les moments exacts du domaine réel 90/5', () => {
    const closed = genericClosedForms(DRAW_DOMAIN_SIZE, DRAW_PICK_SIZE);

    expect(EXACT_SUM_MOMENTS.mean).toBeCloseTo(closed.sumMean, 12);
    expect(EXACT_SUM_MOMENTS.variance).toBeCloseTo(closed.sumVariance, 12);
    expect(EXACT_SUM_MOMENTS.std).toBeCloseTo(Math.sqrt(closed.sumVariance), 12);

    expect(EXACT_AMPLITUDE_MOMENTS.mean).toBeCloseTo(closed.amplitudeMean, 12);
    expect(EXACT_AMPLITUDE_MOMENTS.variance).toBeCloseTo(closed.amplitudeVariance, 12);

    expect(EXACT_CONSECUTIVE_MOMENTS.mean).toBeCloseTo(closed.consecutiveMean, 12);
    expect(EXACT_CONSECUTIVE_MOMENTS.variance).toBeCloseTo(closed.consecutiveVariance, 12);
  });

  it('conserve une distribution AC exhaustive et cohérente avec ses moments', () => {
    expect(EXACT_COMBINATION_COUNT).toBe(choose(DRAW_DOMAIN_SIZE, DRAW_PICK_SIZE));

    const distributionTotal = EXACT_AC_DISTRIBUTION.reduce((s, b) => s + b.count, 0);
    expect(distributionTotal).toBe(EXACT_COMBINATION_COUNT);

    const mean =
      EXACT_AC_DISTRIBUTION.reduce((s, b) => s + b.ac * b.count, 0) / EXACT_COMBINATION_COUNT;
    const second =
      EXACT_AC_DISTRIBUTION.reduce((s, b) => s + b.ac * b.ac * b.count, 0) /
      EXACT_COMBINATION_COUNT;

    expect(EXACT_AC_MOMENTS.mean).toBeCloseTo(mean, 12);
    expect(EXACT_AC_MOMENTS.variance).toBeCloseTo(second - mean * mean, 12);

    // AC maximal pour 5 numéros : 10 différences distinctes − 4 = 6.
    for (const bucket of EXACT_AC_DISTRIBUTION) {
      expect(bucket.ac).toBeGreaterThanOrEqual(0);
      expect(bucket.ac).toBeLessThanOrEqual(DRAW_PICK_SIZE + 1);
    }
  });

  it('fait correspondre calculateACValue aux cas limites de la distribution', () => {
    expect(calculateACValue([1, 2, 3, 4, 5])).toBe(0);
    expect(calculateACValue([1, 3, 5, 7, 9])).toBe(0);
    expect(calculateACValue([1, 2, 3, 4, 6])).toBe(1);
    expect(calculateACValue([1, 2, 4, 8, 16])).toBe(6);
    expect(calculateACValue([90, 89, 88, 87, 86])).toBe(0);
  });

  it('dérive les références d’équiprobabilité sans constante arbitraire', () => {
    expect(UNIFORM_SINGLE_NUMBER_PROBABILITY).toBe(DRAW_PICK_SIZE / DRAW_DOMAIN_SIZE);
    expect(UNIFORM_BRIER_REFERENCE).toBeCloseTo((5 / 90) * (85 / 90), 12);
    expect(UNIFORM_EXPECTED_HITS_TOP_K).toBeCloseTo(25 / 90, 12);
  });
});

describe('FALLBACK_CALIBRATION — prior exact, jamais une valeur impossible', () => {
  it('utilise les moments théoriques exacts', () => {
    expect(FALLBACK_CALIBRATION.isValid).toBe(false);
    expect(FALLBACK_CALIBRATION.meanSum).toBe(EXACT_SUM_MOMENTS.mean);
    expect(FALLBACK_CALIBRATION.stdSum).toBe(EXACT_SUM_MOMENTS.std);
    expect(FALLBACK_CALIBRATION.meanAmplitude).toBe(EXACT_AMPLITUDE_MOMENTS.mean);
    expect(FALLBACK_CALIBRATION.stdAmplitude).toBe(EXACT_AMPLITUDE_MOMENTS.std);
    expect(FALLBACK_CALIBRATION.meanAC).toBe(EXACT_AC_MOMENTS.mean);
    expect(FALLBACK_CALIBRATION.stdAC).toBe(EXACT_AC_MOMENTS.std);
    expect(FALLBACK_CALIBRATION.lambdaConsecutives).toBe(EXACT_CONSECUTIVE_MOMENTS.mean);
  });

  it('borne l’AC moyen sous le maximum combinatoire de 6', () => {
    expect(FALLBACK_CALIBRATION.meanAC).toBeGreaterThan(0);
    expect(FALLBACK_CALIBRATION.meanAC).toBeLessThanOrEqual(6);
  });

  it('régularise un historique court vers un AC physiquement plausible', () => {
    const history: DrawResult[] = Array.from({ length: 8 }, (_, i) => ({
      id: `d${i}`,
      drawName: 'Test',
      date: `2026-01-0${i + 1}`,
      gagnants: [1, 2, 3, 4, 5],
    }));

    const calibration = generateEmpiricalCalibration(history, 0.5, 0.95);
    expect(calibration.isValid).toBe(true);
    expect(calibration.meanAC).toBeGreaterThanOrEqual(0);
    expect(calibration.meanAC).toBeLessThanOrEqual(6);
    expect(calibration.meanSum).toBeGreaterThanOrEqual(15);
    expect(calibration.meanSum).toBeLessThanOrEqual(440);
  });
});
